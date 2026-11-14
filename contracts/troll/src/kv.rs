//! Minimal uncached persistent map: every call goes straight to contract storage.
use near_sdk::borsh::{BorshDeserialize, BorshSerialize, to_vec};
use near_sdk::{env, near};
use std::marker::PhantomData;

#[near(serializers = [borsh])]
pub struct Map<K, V> {
    prefix: Vec<u8>,
    #[borsh(skip)]
    _kv: PhantomData<(K, V)>,
}

impl<K: BorshSerialize, V: BorshSerialize + BorshDeserialize> Map<K, V> {
    pub fn new(prefix: Vec<u8>) -> Self {
        Self { prefix, _kv: PhantomData }
    }

    fn key(&self, k: &K) -> Vec<u8> {
        let mut key = self.prefix.clone();
        k.serialize(&mut key).unwrap();
        key
    }

    pub fn get(&self, k: &K) -> Option<V> {
        env::storage_read(&self.key(k)).map(|b| V::try_from_slice(&b).unwrap())
    }

    pub fn contains_key(&self, k: &K) -> bool {
        env::storage_has_key(&self.key(k))
    }

    pub fn insert(&mut self, k: &K, v: &V) {
        env::storage_write(&self.key(k), &to_vec(v).unwrap());
    }

    /// Returns whether the key was present.
    pub fn remove(&mut self, k: &K) -> bool {
        env::storage_remove(&self.key(k))
    }
}
