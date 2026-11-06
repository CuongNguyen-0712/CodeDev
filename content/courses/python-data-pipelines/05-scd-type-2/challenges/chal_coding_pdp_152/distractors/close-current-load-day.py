# @piece close-current: End the version that was valid until now
wh.execute("UPDATE dim_restaurant SET valid_to = ?, is_current = 0 WHERE restaurant_sk = ?", (date.today().isoformat(), sk))
