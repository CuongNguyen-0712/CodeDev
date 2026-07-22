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

    [ACTION.UPDATE]({ user }) {
        return !!user
    },

    [ACTION.DELETE]({ user }) {
        return !!user
    }
}