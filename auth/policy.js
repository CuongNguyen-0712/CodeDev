import { RESOURCE } from "./resource";

import home from "./policies/home.policy";
import course from "./policies/course.policy";
import blog from "./policies/blog.policy";
import roadmap from "./policies/roadmap.policy";
import learning from "./policies/learning.policy";
import index from "./policies/index.policy";
import settings from "./policies/settings.policy";

export const policies = {
    [RESOURCE.INDEX]: index,
    [RESOURCE.HOME]: home,
    [RESOURCE.COURSE]: course,
    [RESOURCE.BLOG]: blog,
    [RESOURCE.ROADMAP]: roadmap,
    [RESOURCE.LEARNING]: learning,
    [RESOURCE.SETTINGS]: settings,
}