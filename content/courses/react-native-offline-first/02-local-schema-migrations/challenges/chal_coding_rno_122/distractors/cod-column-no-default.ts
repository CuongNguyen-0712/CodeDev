// @piece cod-column: v3: cash to collect on each delivery, 0 for existing rows
{
    version: 3,
    up: (tx) => tx.addColumn("deliveries", "cod_amount", { notNull: true }),
},
