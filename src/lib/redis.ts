import Redis from "ioredis";

const globalForRedis = globalThis as typeof globalThis & {
  redis?: Redis;
};

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? process.env.KV_URL ?? "", {
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
    lazyConnect: true,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

export async function safeRedisGet(key: string): Promise<string | null> {
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    return await redis.get(key);
  } catch {
    return null;
  }
}

export async function safeRedisSet(key: string, value: string, seconds: number): Promise<void> {
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    await redis.set(key, value, "EX", seconds);
  } catch {
    return;
  }
}
