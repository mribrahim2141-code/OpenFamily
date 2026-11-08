// Runs before every test file, ahead of any import of the app: db.ts opens its
// pool from these variables at import time.
process.env.NODE_ENV = 'test';
process.env.POSTGRES_HOST ??= 'localhost';
process.env.POSTGRES_PORT ??= '5432';
process.env.POSTGRES_USER ??= 'openfamily';
process.env.POSTGRES_PASSWORD ??= 'openfamily';
process.env.POSTGRES_DB ??= 'openfamily_test';
process.env.JWT_SECRET = 'test-only-secret-0123456789-0123456789';
process.env.APP_PUBLIC_URL = 'http://app.test';
process.env.AUTH_RATE_LIMIT_MAX = '100000';
process.env.OIDC_FLOW_RATE_LIMIT_MAX = '100000';
process.env.LOG_LEVEL = 'error';
// Docker and CI run PostgreSQL in UTC; a native install often does not. A
// session far from UTC makes any mix-up between local and UTC times fail loudly.
process.env.PGOPTIONS ??= '-c timezone=Pacific/Kiritimati';

// Test suites reset tables between cases. Validate the destination before any
// application/database module is imported so a misconfigured test cannot reach
// a production or otherwise remote PostgreSQL server.
const testDatabase = process.env.POSTGRES_DB.trim();
if (!testDatabase || !testDatabase.endsWith('_test')) {
    throw new Error('Refusing to run tests: POSTGRES_DB must be a non-empty name ending in "_test".');
}

const testHost = (process.env.POSTGRES_HOST || 'localhost').trim().toLowerCase();
const isLoopbackHost = testHost === 'localhost' || testHost === '127.0.0.1' || testHost === '::1';
if (!isLoopbackHost) {
    throw new Error(
        `Refusing to run tests against PostgreSQL host "${testHost}". Only localhost/loopback addresses are allowed.`
    );
}

const testPort = Number(process.env.POSTGRES_PORT);
if (!Number.isInteger(testPort) || testPort < 1 || testPort > 65535) {
    throw new Error('Refusing to run tests: POSTGRES_PORT must be an integer between 1 and 65535.');
}

// Use the validated, normalized values for the pool as well as for the checks.
process.env.POSTGRES_HOST = testHost;
process.env.POSTGRES_PORT = String(testPort);
process.env.POSTGRES_DB = testDatabase;
