import test from "node:test"
import assert from "node:assert/strict"
import { completeRegistration } from "../src/lib/auth/registration-flow.ts"

function fixture() {
  const calls = []
  let profile = null
  const steps = {
    register: async () => { calls.push("register"); return "initial" },
    login: async () => { calls.push("login"); return "fresh" },
    findCustomer: async () => profile,
    createCustomer: async () => { calls.push("create"); profile = { id: "customer" }; return profile },
    saveToken: token => calls.push("token:" + token),
    ensureAddress: async (customer, token) => { assert.equal(token, "fresh"); calls.push("address"); return customer },
  }
  return { steps, calls, setProfile: value => { profile = value } }
}
test("registration refreshes the linked token before saving an address", async () => {
  const f = fixture()
  assert.equal((await completeRegistration(f.steps)).id, "customer")
  assert.deepEqual(f.calls, ["register", "token:initial", "create", "login", "token:fresh", "address"])
})
test("retry after identity creation logs in before creating missing profile", async () => {
  const f = fixture()
  f.steps.register = async () => { throw Error("exists") }
  await completeRegistration(f.steps)
  assert.equal(f.calls[0], "login")
  assert.equal(f.calls.filter(x => x === "create").length, 1)
})
test("wrong credentials never create or overwrite a customer", async () => {
  const f = fixture()
  f.steps.register = async () => { throw Error("exists") }
  f.steps.login = async () => { throw Error("wrong password") }
  await assert.rejects(completeRegistration(f.steps), /exists/)
  assert.deepEqual(f.calls, [])
})
test("lost profile-create response is recovered without a second create", async () => {
  const f = fixture()
  f.steps.createCustomer = async () => { f.calls.push("create"); f.setProfile({id:"customer"}); throw Error("network") }
  assert.equal((await completeRegistration(f.steps)).id, "customer")
  assert.equal(f.calls.filter(x => x === "create").length, 1)
})
test("address failure is visible; retry reuses the existing profile", async () => {
  const f = fixture()
  const address = f.steps.ensureAddress
  f.steps.ensureAddress = async () => { throw Error("address unavailable") }
  await assert.rejects(completeRegistration(f.steps), /address unavailable/)
  f.steps.register = async () => { throw Error("exists") }
  f.steps.ensureAddress = address
  await completeRegistration(f.steps)
  assert.equal(f.calls.filter(x => x === "create").length, 1)
})
test("network errors reading a profile do not create a replacement", async () => {
  const f = fixture()
  f.steps.findCustomer = async () => { throw Error("offline") }
  await assert.rejects(completeRegistration(f.steps), /offline/)
  assert.equal(f.calls.includes("create"), false)
})
