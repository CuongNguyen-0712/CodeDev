// @piece seats: seats
let seats = 1;
const s = typeof b.seats === "string" && b.seats.trim() !== "" ? Number(b.seats) : b.seats;
if (!missing(s)) {
    if (typeof s !== "number" || !Number.isInteger(s)) errors.push({ field: "seats", message: "seats must be an integer" });
    else if (s < 1 || s > 50) errors.push({ field: "seats", message: "seats must be between 1 and 50" });
    else seats = s;
}
