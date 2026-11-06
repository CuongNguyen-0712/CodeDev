// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { deviceTimeZone, getDisplayTimeZone, setDisplayTimeZone } from "@/lib/timeZone";
import { useAdminTimeZoneStore } from "@/stores/adminTimeZoneStore";

const KEY = "codedev_admin_time_zone";

beforeEach(() => {
    localStorage.clear();
    setDisplayTimeZone("UTC");
    useAdminTimeZoneStore.setState({ choice: "auto", zone: "UTC", ready: false });
});

describe("admin time zone store", () => {
    it("follows the device when nothing is saved", () => {
        useAdminTimeZoneStore.getState().hydrate();
        expect(useAdminTimeZoneStore.getState()).toMatchObject({ choice: "auto", zone: deviceTimeZone(), ready: true });
        expect(getDisplayTimeZone()).toBe(deviceTimeZone());
    });

    it("saves a chosen zone in this browser and applies it to the formatters", () => {
        useAdminTimeZoneStore.getState().setChoice("Asia/Tokyo");
        expect(localStorage.getItem(KEY)).toBe("Asia/Tokyo");
        expect(getDisplayTimeZone()).toBe("Asia/Tokyo");

        useAdminTimeZoneStore.setState({ choice: "auto", zone: "UTC", ready: false });
        useAdminTimeZoneStore.getState().hydrate();
        expect(useAdminTimeZoneStore.getState()).toMatchObject({ choice: "Asia/Tokyo", zone: "Asia/Tokyo" });
    });

    it("goes back to auto, and treats a broken saved value as the device", () => {
        useAdminTimeZoneStore.getState().setChoice("auto");
        expect(localStorage.getItem(KEY)).toBe("auto");

        localStorage.setItem(KEY, "Nowhere/Land");
        useAdminTimeZoneStore.getState().hydrate();
        expect(useAdminTimeZoneStore.getState().zone).toBe(deviceTimeZone());
    });
});
