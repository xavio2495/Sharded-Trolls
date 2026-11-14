//! Types and pure math shared by the root and troll contracts.
use near_sdk::json_types::U128;
use near_sdk::{AccountId, env, near, require};

pub const BPS_DENOM: u128 = 10_000;
pub const NEP141: &str = "nep141";
pub const NEP141_VERSION: &str = "1.0.0";
pub const TROLL_STANDARD: &str = "shardedtrolls";
pub const TROLL_VERSION: &str = "1.0.0";

/// Immutable token parameters, set once at init of the root and every troll.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Params {
    pub troll_count: u8,
    /// Burned on cross-troll transfers, in basis points of the amount.
    pub toll_bps: u16,
    /// Distinct counted senders a troll needs in an epoch to be "fed".
    pub feed_target: u32,
    /// Minted per fed epoch across all trolls (split evenly, then among feeders).
    pub reward_per_epoch: U128,
    /// Share of a starving troll's hoard burned per starved epoch.
    pub starve_burn_bps: u16,
    pub epoch_ms: u64,
    pub launch_window_ms: u64,
    pub launch_claim_amount: U128,
    /// Transfers below this amount don't count the sender as a feeder.
    pub min_counted_transfer: U128,
}

/// What a troll tells the root about one finished epoch.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct EpochReport {
    pub epoch: u64,
    pub senders: u32,
    /// Balances + hoard + unclaimed reward pools held by this troll (excludes in-flight).
    pub supply: U128,
    /// Debited for outgoing cross-troll transfers, not yet confirmed or refunded.
    pub in_flight: U128,
    pub hoard: U128,
    /// Everything this troll has minted so far (cumulative).
    pub minted: U128,
    /// Everything this troll has burned so far (cumulative). It can exceed what the troll
    /// itself was allocated or minted, since tokens move between trolls; only the sum over
    /// all trolls is bounded: initial supply + Σ minted − Σ burned = total supply.
    pub burned: U128,
}

/// The root's decision for one troll after an epoch.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub enum Outcome {
    /// Mint `amount` into the epoch's reward pool for that troll's feeders.
    Reward { amount: U128 },
    /// Burn `bps` of the troll's hoard.
    Burn { bps: u16 },
    NoOp,
}

/// Checks the init arguments shared by the root and the trolls.
pub fn validate_setup(params: &Params, trolls: &[AccountId], bounds: &[String]) {
    let n = params.troll_count as usize;
    require!(n > 0, "troll_count must be > 0");
    require!(trolls.len() == n, "trolls.len() must equal troll_count");
    require!(bounds.len() + 1 == n, "bounds.len() must be troll_count - 1");
    require!(bounds.windows(2).all(|w| w[0] < w[1]), "bounds must be strictly increasing");
    for (i, t) in trolls.iter().enumerate() {
        require!(!trolls[..i].contains(t), "duplicate troll account");
    }
    require!(params.toll_bps as u128 <= BPS_DENOM, "toll_bps > 10000");
    require!(params.starve_burn_bps as u128 <= BPS_DENOM, "starve_burn_bps > 10000");
    require!(params.epoch_ms > 0, "epoch_ms must be > 0");
}

/// Index of the troll whose account range holds `account_id`. Troll `i` holds
/// ids in `[bounds[i-1], bounds[i])`; the ranges cover every possible id.
pub fn home_index(bounds: &[String], account_id: &str) -> usize {
    bounds.iter().take_while(|b| account_id >= b.as_str()).count()
}

/// `amount * bps / 10_000` rounded down, without overflow.
pub fn bps_of(amount: u128, bps: u16) -> u128 {
    let bps = bps as u128;
    amount / BPS_DENOM * bps + amount % BPS_DENOM * bps / BPS_DENOM
}

/// Tokens a troll mints for `Reward { amount }` with `feeders` counted senders: an equal
/// whole share per feeder, remainder never minted.
pub fn reward_minted(amount: u128, feeders: u32) -> u128 {
    if feeders == 0 { 0 } else { amount / feeders as u128 * feeders as u128 }
}

/// Tokens a troll burns from its hoard for `Burn { bps }`.
pub fn starve_burned(hoard: u128, bps: u16) -> u128 {
    bps_of(hoard, bps)
}

/// (minted, burned) when `outcome` is applied to the troll that produced `report`.
/// The root uses this to book a settlement exactly as the troll will apply it.
pub fn outcome_effect(report: &EpochReport, outcome: &Outcome) -> (u128, u128) {
    match outcome {
        Outcome::Reward { amount } => (reward_minted(amount.0, report.senders), 0),
        Outcome::Burn { bps } => (0, starve_burned(report.hoard.0, *bps)),
        Outcome::NoOp => (0, 0),
    }
}

/// Epoch number at `now_ms`; epoch 0 starts at `start_ms` (and covers any time before it).
pub fn epoch_at(now_ms: u64, start_ms: u64, epoch_ms: u64) -> u64 {
    now_ms.saturating_sub(start_ms) / epoch_ms
}

pub fn now_ms() -> u64 {
    env::block_timestamp_ms()
}

/// Escapes a string for inclusion inside JSON double quotes.
pub fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

/// Logs one NEP-297 event: `EVENT_JSON:{standard, version, event, data: [data]}`.
/// `data` must be a JSON object.
pub fn emit(standard: &str, version: &str, event: &str, data: &str) {
    env::log_str(&format!(
        r#"EVENT_JSON:{{"standard":"{standard}","version":"{version}","event":"{event}","data":[{data}]}}"#
    ));
}

pub fn emit_ft_transfer(old_owner_id: &AccountId, new_owner_id: &AccountId, amount: u128, memo: Option<&str>) {
    let memo = memo.map_or(String::new(), |m| format!(r#","memo":"{}""#, json_escape(m)));
    emit(
        NEP141,
        NEP141_VERSION,
        "ft_transfer",
        &format!(r#"{{"old_owner_id":"{old_owner_id}","new_owner_id":"{new_owner_id}","amount":"{amount}"{memo}}}"#),
    );
}

pub fn emit_ft_mint(owner_id: &AccountId, amount: u128, memo: &str) {
    let d = format!(r#"{{"owner_id":"{owner_id}","amount":"{amount}","memo":"{}"}}"#, json_escape(memo));
    emit(NEP141, NEP141_VERSION, "ft_mint", &d);
}

pub fn emit_ft_burn(owner_id: &AccountId, amount: u128, memo: &str) {
    let d = format!(r#"{{"owner_id":"{owner_id}","amount":"{amount}","memo":"{}"}}"#, json_escape(memo));
    emit(NEP141, NEP141_VERSION, "ft_burn", &d);
}

/// Token-specific events (`feeding_settled`, `troll_starved`, `streak`, ...). `data` is a JSON object.
pub fn emit_troll_event(event: &str, data: &str) {
    emit(TROLL_STANDARD, TROLL_VERSION, event, data);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn b(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn home_index_follows_lexicographic_ranges() {
        let bounds = b(&["650", "earn.kaiching", "wallet.ka"]);
        assert_eq!(home_index(&bounds, "0.shardedtrolls.near"), 0);
        assert_eq!(home_index(&bounds, "650"), 1);
        assert_eq!(home_index(&bounds, "alice.near"), 1);
        assert_eq!(home_index(&bounds, "h.shardedtrolls.near"), 2);
        assert_eq!(home_index(&bounds, "wallet.ka"), 3);
        assert_eq!(home_index(&bounds, "zz.near"), 3);
        assert_eq!(home_index(&[], "anyone.near"), 0);
    }

    #[test]
    fn bps_math_is_exact_and_safe() {
        assert_eq!(bps_of(10_000, 25), 25);
        assert_eq!(bps_of(399, 25), 0);
        assert_eq!(bps_of(400, 25), 1);
        assert_eq!(bps_of(u128::MAX, 10_000), u128::MAX);
        let a = 123_456_789_012_345_678_901u128;
        assert_eq!(bps_of(a, 37), a * 37 / 10_000);
    }

    #[test]
    fn outcome_effects() {
        let r = EpochReport { epoch: 0, senders: 3, supply: U128(0), in_flight: U128(0), hoard: U128(1_999), minted: U128(0), burned: U128(0) };
        assert_eq!(outcome_effect(&r, &Outcome::Reward { amount: U128(1_000) }), (999, 0));
        assert_eq!(outcome_effect(&r, &Outcome::Burn { bps: 100 }), (0, 19));
        assert_eq!(outcome_effect(&r, &Outcome::NoOp), (0, 0));
        assert_eq!(reward_minted(1_000, 0), 0);
    }

    #[test]
    fn epochs() {
        assert_eq!(epoch_at(500, 1_000, 100), 0);
        assert_eq!(epoch_at(1_099, 1_000, 100), 0);
        assert_eq!(epoch_at(1_100, 1_000, 100), 1);
    }

    #[test]
    fn events_are_valid_json() {
        use near_sdk::serde_json::{self, Value};
        let a: AccountId = "a.near".parse().unwrap();
        emit_ft_transfer(&a, &a, 5, Some("q\"uote\\ \n end"));
        emit_ft_burn(&a, 7, "toll");
        for log in near_sdk::test_utils::get_logs() {
            let v: Value = serde_json::from_str(log.strip_prefix("EVENT_JSON:").unwrap()).unwrap();
            assert_eq!(v["standard"], "nep141");
            assert!(v["data"][0]["amount"].is_string());
        }
        let v: Value = serde_json::from_str(&near_sdk::test_utils::get_logs()[0][11..]).unwrap();
        assert_eq!(v["data"][0]["memo"], "q\"uote\\ \n end");
    }

    #[test]
    fn outcome_json_shape() {
        use near_sdk::serde_json;
        let o = Outcome::Reward { amount: U128(5) };
        assert_eq!(serde_json::to_string(&o).unwrap(), r#"{"Reward":{"amount":"5"}}"#);
        assert_eq!(serde_json::to_string(&Outcome::NoOp).unwrap(), r#""NoOp""#);
    }
}
