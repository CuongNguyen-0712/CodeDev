// @piece swap-boards: Put the fresh board in place
redis.rename(NEXT_BOARD, BOARD);
redis.rename(NEXT_SEEN, SEEN);
