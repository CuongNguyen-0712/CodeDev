// @piece self-time: The part of the span no child covers
let childTime = 0;
for (const child of children) childTime += child.endTime - child.startTime;
return span.endTime - span.startTime - childTime;
