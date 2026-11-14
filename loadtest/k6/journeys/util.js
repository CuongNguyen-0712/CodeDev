export const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 3) | 8).toString(16);
});

// The `data` field of a { success, data } API response, or undefined when the body is not JSON.
export const json = (res) => {
    try {
        return res.json("data");
    } catch {
        return undefined;
    }
};
