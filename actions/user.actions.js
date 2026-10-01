'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import UpdateInfoService from "@/services/updateService/infoService";

export async function updateUserProfileAction(data) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return { success: false, message: "Unauthorized", status: 401 };
        }

        const userId = session.user.id;
        const { nickname, surname, phone, name, email, image, bio } = data || {};

        const isUpdate = nickname || surname || phone || name || email || image || bio;
        if (!isUpdate) {
            return { success: false, message: "No data to update", status: 400 };
        }

        const result = await UpdateInfoService({
            userId,
            nickname,
            surname,
            phone,
            name,
            email,
            image,
            bio,
        });

        return { success: !!result };
    } catch (error) {
        return {
            success: false,
            message: error.message || "Failed to update profile",
            status: error.status || 500
        };
    }
}
