import { ACTION } from "../actions";

export default {
    [ACTION.LIST]() {
        return true
    },

    [ACTION.READ]() {
        return true
    },

    [ACTION.CREATE]({ user }) {
        return !!user
    },

    [ACTION.UPDATE]({ user, resource }) {
        if (!resource) return false;

        return user.id === resource.author_id;
    },

    [ACTION.DELETE]({ user, resource }) {
        if (!resource) return false;

        return user.id === resource.author_id;
    }
}