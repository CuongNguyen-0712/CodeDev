# @piece wal-chain: End of the gap-free WAL chain from a start time
def wal_chain_end(wal_archive, start):
    return max(t(segment["to"]) for segment in wal_archive)
