# @piece version-on-day: The version that was valid on a given day
row = wh.execute(
    "SELECT restaurant_sk FROM dim_restaurant WHERE restaurant_id = ? AND is_current = 1",
    (restaurant_id,)).fetchone()
