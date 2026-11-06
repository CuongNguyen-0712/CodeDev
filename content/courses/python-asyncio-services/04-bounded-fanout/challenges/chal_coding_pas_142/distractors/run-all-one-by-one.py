# @piece run-all: Start every restaurant and keep the input order
results = [await fetch_or_error(rid) for rid in restaurant_ids]
