import { Redis } from 'ioredis';
export function make(url) {
    return new Redis(url);
}
