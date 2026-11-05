// @piece waiting-reasons: Containers that never started: image or config
const current = (status.state && status.state.terminated) || null;
if (current && (current.reason === "ImagePullBackOff" || current.reason === "ErrImagePull")) {
    return { cause: "ImagePullBackOff", evidence: current.message, next: NEXT.ImagePullBackOff };
}
if (current && current.reason === "CreateContainerConfigError") {
    return { cause: "CreateContainerConfigError", evidence: current.message, next: NEXT.CreateContainerConfigError };
}
