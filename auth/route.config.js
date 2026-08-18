import index from './route/index.route'
import auth from './route/auth.route'
import home from './route/home.route'
import course from './route/course.route'
import learning from './route/learning.route'
import blog from './route/blog.route'
import roadmap from './route/roadmap.route'
import settings from './route/settings.route'

export const routeConfig = [
    ...index,
    ...auth,
    ...home,
    ...course,
    ...learning,
    ...blog,
    ...roadmap,
    ...settings,
]
