import { neon } from '@neondatabase/serverless'
import { Pool } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined')
}

const isProd = process.env.NODE_ENV === 'production'

let sql

if (isProd) {
    sql = neon(DATABASE_URL)
} else {
    const pool = new Pool({
        connectionString: DATABASE_URL,
    })

    sql = {
        query: async (text, params = []) => {
            const res = await pool.query(text, params)
            return res.rows
        }
    }
}

export { sql }
