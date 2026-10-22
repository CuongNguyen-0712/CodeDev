// Cho Xanh - the wallet and the payment methods at checkout.
//
// The checkout only knows the PaymentMethod interface. Implement the wallet and the three
// payment methods so that every rule lives INSIDE the class that owns the money: nobody
// outside can change a balance or a card limit directly (they are `private set`).
//
// Rules (an amount is in whole VND):
//   Every amount must be greater than 0. A zero or negative amount is declined / rejected
//   and changes nothing.
//   Wallet.topUp(amount)   at most 10,000,000 per top-up, and the balance may never go
//                          above 20,000,000. Returns true and adds the amount, or returns
//                          false and changes nothing.
//   Wallet.pay(amount)     only up to the current balance (paying exactly the balance is fine).
//   CashOnDelivery         accepts up to 2,000,000 per order (drivers carry no more change).
//   WalletPayment          charges the wallet it was created with.
//   CardPayment            accepts up to limitLeft; a successful charge reduces limitLeft.
//
// Input (stdin), the test runner parses it:
//   line 1: wallet BALANCE card LIMIT
//   then:   topup AMOUNT | pay cash|wallet|card AMOUNT | balance
// Output, one line per command:
//   topup 50000: ok                  or  topup 50000: rejected
//   pay wallet 120000: ok            or  pay wallet 120000: declined
//   wallet 30000 VND, card limit 300000 VND

const val MAX_TOP_UP = 10_000_000L
const val MAX_BALANCE = 20_000_000L
const val MAX_CASH = 2_000_000L

class Wallet(initialBalance: Long) {
    var balance: Long = initialBalance
        private set

    fun topUp(amount: Long): Boolean {
        if (amount <= 0 || amount > MAX_TOP_UP || balance + amount > MAX_BALANCE) return false
        balance += amount
        return true
    }

    fun pay(amount: Long): Boolean {
        if (amount <= 0 || amount > balance) return false
        balance -= amount
        return true
    }
}

interface PaymentMethod {
    val label: String
    fun charge(amount: Long): Boolean
}

class CashOnDelivery : PaymentMethod {
    override val label = "cash"

    override fun charge(amount: Long): Boolean {
        return amount in 1..MAX_CASH
    }
}

class WalletPayment(private val wallet: Wallet) : PaymentMethod {
    override val label = "wallet"

    override fun charge(amount: Long): Boolean {
        return wallet.pay(amount)
    }
}

class CardPayment(limit: Long) : PaymentMethod {
    override val label = "card"

    var limitLeft: Long = limit
        private set

    override fun charge(amount: Long): Boolean {
        if (amount <= 0 || amount > limitLeft) return false
        limitLeft -= amount
        return true
    }
}

// ---------------------------------------------------------------- test runner (do not change)
fun main() {
    val first = readln().trim().split(" ")
    val wallet = Wallet(first[1].toLong())
    val card = CardPayment(first[3].toLong())
    val methods: List<PaymentMethod> = listOf(CashOnDelivery(), WalletPayment(wallet), card)
    for (line in generateSequence(::readLine)) {
        val f = line.trim().split(" ")
        when (f[0]) {
            "topup" -> println("$line: ${if (wallet.topUp(f[1].toLong())) "ok" else "rejected"}")
            "pay" -> {
                val method = methods.first { it.label == f[1] }
                println("$line: ${if (method.charge(f[2].toLong())) "ok" else "declined"}")
            }
            "balance" -> println("wallet ${wallet.balance} VND, card limit ${card.limitLeft} VND")
        }
    }
}
