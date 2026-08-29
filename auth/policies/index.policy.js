import { ACTION } from "../actions";

export default {
    [ACTION.LIST]({ user }) {
        return !user
    }
}