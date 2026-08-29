import { ACTION } from '../actions'

export default {
    [ACTION.LIST]() {
        return true
    },

    [ACTION.READ]() {
        return true
    },

    [ACTION.CREATE]({ user }) {
        return user.role === 'admin' || user.role === 'moderator'
    },

    [ACTION.UPDATE]({ user, resource }) {
        if (!resource) return false;

        return user.id === resource.author_id;
    },

    [ACTION.LEARN]({ user }) {
        return !!user
    },

    [ACTION.ENROLL]({ user }) {
        return !!user
    },

    [ACTION.DELETE]({ user }) {
        return user.role === 'admin' || user.role === 'moderator'
    },

    [ACTION.COMMENT]({ user }) {
        return !!user
    },

    [ACTION.FAVORITE]({ user }) {
        return !!user
    },

    [ACTION.UNFAVORITE]({ user }) {
        return !!user
    }
}

