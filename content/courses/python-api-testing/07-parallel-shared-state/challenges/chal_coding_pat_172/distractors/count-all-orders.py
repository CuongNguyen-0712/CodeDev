# @piece count-my-orders: Count only the orders this test created
return len(api.get("/orders")[1])
