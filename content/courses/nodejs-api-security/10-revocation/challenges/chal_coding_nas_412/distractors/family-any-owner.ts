// @piece family-owner: Find the family and check who owns it
const family = s.rows.filter((r) => r.familyId === familyId);
if (family.length === 0) return false;
