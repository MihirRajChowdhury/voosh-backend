const redis = require('redis');

let client;

const initRedis = async () => {
    if (process.env.REDIS_URL) {
        let redisUrl = process.env.REDIS_URL;
        if (redisUrl.startsWith('redis://')) {
            redisUrl = redisUrl.replace('redis://', 'rediss://');
        }

        client = redis.createClient({
            url: redisUrl,
            socket: {
                tls: true,
                rejectUnauthorized: false
            }
        });

        client.on('error', (err) => console.log('Redis Client Error', err));

        try {
            await client.connect();
            console.log('Connected to Redis');
        } catch (error) {
            console.log('Failed to connect to Redis, using in-memory fallback');
            client = null;
        }
    } else {
        console.log('No REDIS_URL provided, using in-memory fallback');
    }
};

const getClient = () => client;

module.exports = { initRedis, getClient };
