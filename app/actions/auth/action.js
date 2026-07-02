'use server'
import { sql } from '@/app/lib/db';

export async function signUp({ id, public_id, surname, name, email, username, password }) {
    const params = [];

    params.push(id, public_id, surname, name, email, username, password);

    const query = `call add_user($1, $2, $3, $4, $5, $6, $7)`;

    return await sql.query(query, params)
}