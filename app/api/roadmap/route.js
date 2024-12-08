'use server'
import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

export async function GET() {
    const res = await sql`SELECT * FROM content`;
    const data = res.rows;
    return NextResponse.json(data)
}
