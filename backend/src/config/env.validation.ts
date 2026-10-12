export function validateEnvironment(config:Record<string,unknown>){if(!config.DATABASE_URL)throw new Error('DATABASE_URL is required');return config;}
