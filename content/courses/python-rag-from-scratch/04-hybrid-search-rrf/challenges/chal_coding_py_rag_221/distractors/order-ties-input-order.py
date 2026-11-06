# @piece order: Best fused score first
ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)
