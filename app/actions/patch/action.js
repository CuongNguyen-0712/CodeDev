import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export async function updateInfo(data) {
    try {
        const { nickname, surname, name, email, image, bio } = data

        const res = await sql`
        update infouser
        set 
        nickname = case when ${nickname} is distinct from nickname then ${nickname} else nickname end,
        surname = case when ${surname} is distinct from surname then ${surname} else surname end,
        name = case when ${name} is distinct from name then ${name} else name end,
        email = case when ${email} is distinct from email then ${email} else email end,
        image = case when ${image} is distinct from image then ${image} else image end,
        bio = case when ${bio} is distinct from bio then ${bio} else bio end
        where id = 'CD01'
        `
        return new Response(JSON.stringify(res), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }
    catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ message: "Failed to load content, try again" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}