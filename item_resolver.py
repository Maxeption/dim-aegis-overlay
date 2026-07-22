# Global mapping structure for Origin Trait groups and their specific perk overrides/source rules.
ORIGIN_TRAIT_GROUPS = {
    "Indomitability": {
        "GroupKey": "BRAVE",
        "PrefixPerkOverrides": {"brave": ["Trait A Roll Rule"], "forbearance": ["Trait B Roll Rule"], "succession": ["Trait C Roll Rule"]},
        "Exclusions": set(["Edge Transit", "Elsie's Rifle", "Hung Jury SR4", "Luna's Howl", "Midnight Coup", "The Mountaintop", "The Recluse"])
    },
    "Elliptical Orbit": {
        "GroupKey": "PANTHEON_VERSION",
        "PrefixPerkOverrides": {"chattering bone": ["Trait D Roll Rule"], "reckless oracle": ["Trait E Roll Rule"], "zaouli's bane": ["Trait F Roll Rule"]},
        "Exclusions": set(["Alone as a god", "Bane of Sorrow", "Threat Level"])
    },
    "Gravity Well": {
        "GroupKey": "ROTN_VERSION",
        # RotN has 12 versions, requiring 12 specific rule mappings.
        "PrefixPerkOverrides": {
            "a sudden death": ["Trait G Roll Rule"],
            "cold comfort": ["Trait H Roll Rule"],
            # ... (Insert all remaining 10 rules) ...
            "wilderflight": ["Trait P Roll Rule"] # Placeholder for the last version
        },
        "Exclusions": set()
    }
    # Outlier handling added separately below
}


def resolve_contextual_perks(item_data: dict) -> list[str]:
    """
    Determines the correct perk pool and roll generation rules for a weapon variation 
    by prioritizing Origin Trait grouping.

    Args:
        item_data: Dictionary containing item name, ID, and any associated version keys.
    Returns:
        list[str]: A list of resolved perks/roll definitions.
    """
    name = item_data.get("Name", "").lower()
    
    # --- Step 1: Check for Origin Trait Grouping (High Priority) ---
    for trait, group_config in ORIGIN_TRAIT_GROUPS.items():
        group_key = group_config["GroupKey"].lower()

        # Attempt to match the common naming scheme: [Name] [Version Name] 
        # E.g., 'falling guillotine brave version' matches both item name and group key prefix structure.
        
        if any(f"{group_key} {name.split(' ')[0].lower()}" in trait.lower() or f" {trait}'s {group_key} " in name) and name not in ORIGIN_TRAIT_GROUPS[trait]["Exclusions"]:
            print(f"[INFO] Detected Origin Trait Group: {trait}")

            # Logic to extract the specific version differentiator (e.g., 'brave', 'pantheon')
            # This requires pattern matching against known group naming conventions. 
            if "BRAVE" in trait and name.startswith(("falling", "forbearance", "succession")):
                version_name = next((k for k in ["brave", "forbearance", "succession"] if k in name), None)
            elif "PANTHEON" in trait and name.startswith(("chattering", "reckless", "zaouli's")):
                 # Complex regex/split logic would go here to isolate the prefix word
                pass 

            # Use a simplified check for demonstration: Assume version prefix is the differentiating factor after group identification
            if version_name:
                print(f"[DEBUG] Applying {trait} context rules using identifier: '{version_name}'")
                # Return the specific perks dictated by the Origin Trait mapping
                return [group_config["PrefixPerkOverrides"].get(version_name.lower(), ["ERROR: Unknown Version Roll"])]

    # --- Step 2: Outlier/Specific Name Conflict Resolution (Medium Priority) ---
    if "high albedo" in name and item_data.get("is_rocket_sidearm", False):
        print("[INFO] Detected High Albedo Rocket Variant. Overriding standard rolls.")
        # The rocket version has the Origin Trait, but needs manual flagging for differentiation
        return ["Rocket Sidearm Perk Pool 1", "Rocket Sidearm Perk Pool 2"]

    # --- Step 3: Fallback to Standard ID/Roll Lookup (Low Priority) ---
    print("[INFO] No specific context found. Falling back to standard ID lookup.")
    # If no specialized grouping or variation is detected, use the item's standard roll logic.
    return ["Standard Weapon Perk Pool A", "Standard Weapon Perk Pool B"]
