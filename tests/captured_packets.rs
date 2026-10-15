use cmf_eq::protocol::{decode_eq, encode_eq};

#[test]
fn encoder_matches_every_captured_eq_write() {
    let rows: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/eq-capture-packets.json")).unwrap();
    let mut checked = 0;
    for row in rows.as_array().unwrap() {
        if row["command"] != "0xf041" {
            continue;
        }
        let hex: String = row["payload_hex"]
            .as_str()
            .unwrap()
            .split_whitespace()
            .collect();
        let bytes: Vec<u8> = (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
            .collect();
        assert_eq!(encode_eq(&decode_eq(&bytes).unwrap()).unwrap(), bytes);
        checked += 1;
    }
    assert_eq!(checked, 6);
}
