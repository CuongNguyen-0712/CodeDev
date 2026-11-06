// @piece boundary-and-props: Mark the boundary and check the props crossing it
if (parentOnClient !== true) {
    plan.useClient.push(node.name);
    if (parentOnClient === false) {
        for (const [prop, kind] of Object.entries(node.props ?? {})) {
            if (!CAN_CROSS.includes(kind) || kind === "date") plan.badProps.push(`${node.name}.${prop} (${kind})`);
        }
    }
}
