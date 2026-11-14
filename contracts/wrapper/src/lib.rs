//! Wrapped troll token: an ordinary single-contract NEP-141 for DEXes and other contracts
//! that expect one token account. It lives on one shard, so trading it is not sharded.
//!
//! Wrap: `ft_transfer_call` the troll token to this account (from any troll); it mints 1:1
//! what arrives. Unwrap: `unwrap(amount)` burns and sends the troll token back to the caller.
//! Backing: total wrapped supply = this account's balance at its home troll, apart from
//! unwraps in flight.
use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::events::{FtBurn, FtMint};
use near_contract_standards::fungible_token::metadata::FungibleTokenMetadata;
use near_contract_standards::fungible_token::resolver::FungibleTokenResolver;
use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::storage_management::{StorageBalance, StorageBalanceBounds, StorageManagement};
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, assert_one_yocto, env, ext_contract, near,
    require,
};

pub const GAS_FOR_TROLL_TRANSFER: Gas = Gas::from_tgas(30);
pub const GAS_FOR_ON_UNWRAP: Gas = Gas::from_tgas(10);

#[ext_contract(ext_troll)]
pub trait TrollToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) -> bool;
}

#[near(contract_state, contract_metadata(standard(standard = "nep141", version = "1.0.0"), standard(standard = "nep145", version = "1.0.0"), standard(standard = "nep148", version = "1.0.0"), standard(standard = "nep297", version = "1.0.0")))]
#[derive(PanicOnDefault)]
pub struct Wrapper {
    token: FungibleToken,
    metadata: FungibleTokenMetadata,
    /// The troll this account is homed on: the only token it accepts and pays out from.
    troll: AccountId,
    /// Unwraps in flight per account. While present the account cannot unregister, so a
    /// failed payout always re-mints onto a record whose storage the account paid for.
    unwrapping: LookupMap<AccountId, u128>,
}

#[near]
impl Wrapper {
    #[init]
    pub fn new(troll: AccountId, metadata: FungibleTokenMetadata) -> Self {
        metadata.assert_valid();
        // Metadata sits in the state every call reads and writes, including the fixed-gas callback.
        require!(metadata.name.len() <= 64 && metadata.symbol.len() <= 16, "metadata name or symbol too long");
        require!(metadata.icon.as_ref().is_none_or(|i| i.len() <= 1024), "metadata icon over 1024 bytes");
        require!(metadata.reference.as_ref().is_none_or(|r| r.len() <= 1024), "metadata reference over 1024 bytes");
        Self { token: FungibleToken::new(b"t".to_vec()), metadata, troll, unwrapping: LookupMap::new(b"u".to_vec()) }
    }

    /// Wrap. Called by the home troll after a troll-token `ft_transfer_call` to this account.
    /// Mints 1:1 to the sender, who must be registered here; otherwise returns everything
    /// (the troll refunds it).
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        let _ = msg;
        require!(env::predecessor_account_id() == self.troll, "only the troll token can be wrapped");
        if self.token.storage_balance_of(sender_id.clone()).is_none() || amount.0 == 0 {
            return PromiseOrValue::Value(amount);
        }
        self.token.internal_deposit(&sender_id, amount.0);
        FtMint { owner_id: &sender_id, amount, memo: Some("wrap") }.emit();
        PromiseOrValue::Value(U128(0))
    }

    /// Unwrap: burns `amount` wrapped tokens and sends the troll token to the caller's home troll
    /// (a cross-troll payout pays the toll). Re-mints if the payout fails. Attach 1 yoctoNEAR.
    #[payable]
    pub fn unwrap(&mut self, amount: U128) -> Promise {
        assert_one_yocto();
        let who = env::predecessor_account_id();
        require!(amount.0 > 0, "amount must be > 0");
        self.token.internal_withdraw(&who, amount.0);
        let pending = self.unwrapping.get(&who).copied().unwrap_or(0);
        self.unwrapping.insert(who.clone(), pending + amount.0);
        FtBurn { owner_id: &who, amount, memo: Some("unwrap") }.emit();
        ext_troll::ext(self.troll.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_TROLL_TRANSFER)
            .ft_transfer(who.clone(), amount, Some("unwrap".into()))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_FOR_ON_UNWRAP).on_unwrap(who, amount))
    }

    /// `true` if the troll token reached the user; otherwise the wrapped tokens are restored.
    #[private]
    pub fn on_unwrap(&mut self, account_id: AccountId, amount: U128) -> bool {
        let delivered = env::promise_result_checked(0, 16).is_ok_and(|b| b == b"true");
        let pending = self.unwrapping.get(&account_id).copied().unwrap_or(0) - amount.0;
        if pending == 0 {
            self.unwrapping.remove(&account_id);
        } else {
            self.unwrapping.insert(account_id.clone(), pending);
        }
        if !delivered {
            self.token.internal_deposit(&account_id, amount.0);
            FtMint { owner_id: &account_id, amount, memo: Some("unwrap refund") }.emit();
        }
        delivered
    }

    pub fn troll(&self) -> AccountId {
        self.troll.clone()
    }

    // ---------- NEP-141 ----------

    #[payable]
    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    pub fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    pub fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }

    #[private]
    pub fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        self.token.ft_resolve_transfer(sender_id, receiver_id, amount)
    }

    pub fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.clone()
    }

    // ---------- NEP-145 ----------

    #[payable]
    pub fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    pub fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    /// Without `force`, the wrapped balance must be zero. With `force`, it is burned, and the
    /// matching troll tokens stay locked here for good (total supply stays fully backed).
    #[payable]
    pub fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        require!(
            !self.unwrapping.contains_key(&env::predecessor_account_id()),
            "unwrap in flight; try again after it resolves"
        );
        if let Some((account_id, balance)) = self.token.internal_storage_unregister(force) {
            if balance > 0 {
                FtBurn { owner_id: &account_id, amount: U128(balance), memo: Some("storage_unregister") }.emit();
            }
            true
        } else {
            false
        }
    }

    pub fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[cfg(test)]
mod tests;
