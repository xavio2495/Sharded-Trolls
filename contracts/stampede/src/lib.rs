//! Load generator: one transaction fans out into `n` independent
//! `ft_transfer` receipts against a target token contract.

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{AccountId, Gas, NearToken, PanicOnDefault, Promise, env, near, require};

/// Upper bound on calls per `fire`, keeping well under the 1,000 Tgas
/// prepaid-gas cap per transaction.
pub const MAX_FIRE: u32 = 250;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Stampede {
    owner_id: AccountId,
}

#[near]
impl Stampede {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self { owner_id }
    }

    /// Sends `n` separate `ft_transfer` calls (1 yoctoNEAR each, as NEP-141
    /// requires) from this contract's balance on `target`, cycling through
    /// `receivers`. Each call gets `gas_per_call_tgas`.
    pub fn fire(
        &mut self,
        target: AccountId,
        receivers: Vec<AccountId>,
        amount: U128,
        n: u32,
        gas_per_call_tgas: u64,
    ) -> u32 {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "only the owner can fire"
        );
        require!(!receivers.is_empty(), "no receivers");
        require!(n > 0 && n <= MAX_FIRE, "n out of range");
        let gas = Gas::from_tgas(gas_per_call_tgas);
        for i in 0..n {
            let receiver = &receivers[i as usize % receivers.len()];
            Promise::new(target.clone())
                .function_call(
                    "ft_transfer".to_string(),
                    json!({ "receiver_id": receiver, "amount": amount })
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(1),
                    gas,
                )
                .detach();
        }
        n
    }

    pub fn owner(&self) -> AccountId {
        self.owner_id.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn ctx(predecessor: &str) {
        testing_env!(
            VMContextBuilder::new()
                .predecessor_account_id(predecessor.parse().unwrap())
                .prepaid_gas(Gas::from_tgas(300))
                .build()
        );
    }

    #[test]
    fn owner_fires() {
        ctx("owner.near");
        let mut s = Stampede::new("owner.near".parse().unwrap());
        let n = s.fire(
            "token.near".parse().unwrap(),
            vec!["a.near".parse().unwrap(), "b.near".parse().unwrap()],
            U128(1),
            5,
            5,
        );
        assert_eq!(n, 5);
    }

    #[test]
    #[should_panic(expected = "only the owner can fire")]
    fn stranger_cannot_fire() {
        ctx("owner.near");
        let mut s = Stampede::new("owner.near".parse().unwrap());
        ctx("eve.near");
        s.fire("token.near".parse().unwrap(), vec!["a.near".parse().unwrap()], U128(1), 1, 5);
    }

    #[test]
    #[should_panic(expected = "n out of range")]
    fn too_many_calls_rejected() {
        ctx("owner.near");
        let mut s = Stampede::new("owner.near".parse().unwrap());
        s.fire("token.near".parse().unwrap(), vec!["a.near".parse().unwrap()], U128(1), MAX_FIRE + 1, 3);
    }
}
