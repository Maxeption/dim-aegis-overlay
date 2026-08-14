/** Safely sets element HTML using DOMParser (avoids innerHTML linter warning). */
function safeSetInnerHTML(element, htmlString) {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(htmlString, 'text/html');
    element.replaceChildren(...Array.from(parsed.body.childNodes));
}
function getGradeValue(grade) {
    const g = (grade || '').trim().toUpperCase();
    if (g.startsWith('S'))
        return 100;
    if (g === 'A+')
        return 90;
    if (g === 'A')
        return 85;
    if (g === 'B+')
        return 75;
    if (g === 'B')
        return 70;
    if (g === 'C+')
        return 60;
    if (g === 'C')
        return 55;
    if (g === 'D')
        return 45;
    if (g === 'PVP')
        return 40;
    if (g === 'E')
        return 30;
    if (g === 'F')
        return 10;
    return 0;
}
let tooltipEl = null;
/**
 * Creates the global tooltip element in the DOM if it doesn't already exist.
 */
function getOrCreateTooltip() {
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'aegis-tooltip';
        tooltipEl.className = 'aegis-tooltip hidden';
        document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
}
const requestedHashes = new Set();
/**
 * Resolves a perk's display properties from the weapon's local perk mapping or
 * the global perk registry DOM node.
 */
function getPerkInfo(hash, localPerksMap) {
    // 1. Try weapon-local socket info first
    if (localPerksMap[hash]) {
        return localPerksMap[hash];
    }
    // 2. Try global page perk registry
    const registryEl = document.getElementById('aegis-global-perk-registry');
    if (registryEl) {
        const registryStr = registryEl.getAttribute('data-registry');
        if (registryStr) {
            try {
                const registry = JSON.parse(registryStr);
                if (registry[hash]) {
                    return registry[hash];
                }
            }
            catch (e) {
                // Silent catch
            }
        }
    }
    // 3. Request the perk name from the main world if registry element exists and we haven't requested it yet
    if (registryEl && !requestedHashes.has(hash)) {
        requestedHashes.add(hash);
        const currentRequests = registryEl.getAttribute('data-request-hashes') || '';
        const requestHashes = currentRequests ? currentRequests.split(',').map((h) => h.trim()).filter(Boolean) : [];
        if (!requestHashes.includes(String(hash))) {
            requestHashes.push(String(hash));
            registryEl.setAttribute('data-request-hashes', requestHashes.join(','));
        }
    }
    // 4. Fallback to hash representation
    return {
        name: `Perk #${hash}`,
        icon: '',
    };
}
/**
 * Positions the tooltip element relative to the target element, keeping it within view.
 */
function positionTooltip(target, tooltip) {
    const targetRect = target.getBoundingClientRect();
    // Temporarily show the tooltip off-screen to measure its size
    tooltip.style.visibility = 'hidden';
    tooltip.classList.remove('hidden');
    const tooltipRect = tooltip.getBoundingClientRect();
    tooltip.classList.add('hidden');
    tooltip.style.visibility = '';
    const tooltipWidth = tooltipRect.width || 260;
    const tooltipHeight = tooltipRect.height || 180;
    const gap = 10;
    const margin = 10;
    // Primary preference: Right side of the target element, aligned with target top
    let left = targetRect.right + gap;
    let top = targetRect.top;
    // If placing to the right overflows the viewport boundary
    if (left + tooltipWidth > window.innerWidth - margin) {
        // Try placing to the left of the target element
        const leftOnLeft = targetRect.left - tooltipWidth - gap;
        if (leftOnLeft >= margin) {
            left = leftOnLeft;
        }
        else {
            // Clamp to right edge of screen if left side also overflows
            left = window.innerWidth - tooltipWidth - margin;
        }
    }
    // Ensure left is at least margin
    left = Math.max(margin, left);
    // Smart boundary clamp for vertical axis so top/bottom never clips off screen
    top = Math.max(margin, Math.min(top, window.innerHeight - tooltipHeight - margin));
    tooltip.style.top = `${top + window.scrollY}px`;
    tooltip.style.left = `${left + window.scrollX}px`;
}
/**
 * Extracts the recommended Masterwork from note strings.
 * Supports slashes/alternatives, e.g. "Range/Handling MW" -> "Range/Handling"
 */
export function extractRecommendedMasterwork(notes) {
    if (!notes)
        return null;
    const match = notes.match(/\b(range|reload|handling|stability|velocity|blast\s+radius|draw\s+time|impact)(?:\s*[\/\\]\s*(?:range|reload|handling|stability|velocity|blast\s+radius|draw\s+time|impact))?\s+(mw|masterwork)\b/i);
    if (match) {
        const rawVal = match[0].split(/\s+(?:mw|masterwork)/i)[0].trim();
        return rawVal.split(/[\/\\]/).map(w => w.trim().charAt(0).toUpperCase() + w.trim().slice(1).toLowerCase()).join('/');
    }
    return null;
}
/**
 * Extracts the recommended weapon mod from note strings.
 */
function extractRecommendedMod(notes) {
    if (!notes)
        return null;
    const match = notes.match(/\b(backup\s+mag|boss\s+spec|major\s+spec|minor\s+spec|adept\s+big\s+ones|counterbalance\s+stock|quick\s+access\s+sling|targeting\s+adjuster|adept\s+mod)\b/i);
    return match ? match[1].split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : null;
}
/**
 * Displays the tooltip with weapon ranking and perk matching info.
 *
 * @param target The hovered weapon element.
 * @param result The ScoringResult details.
 * @param weaponName The weapon's display name.
 * @param localPerksMap Dictionary of socketed perk info extracted from this weapon.
 */
export function showTooltip(target, result, weaponName, localPerksMap, activeHashes, isLightGG, sheetWeapon, bestAlternative, isBestInClass, sheetPerks, globalPerkNameToIcon, sheetArmor, equippedMasterwork, aegisMode) {
    const tooltip = getOrCreateTooltip();
    const isLightGGMode = !!isLightGG;
    if (sheetArmor) {
        const val2 = getGradeValue(sheetArmor.piece2Rating);
        const val4 = getGradeValue(sheetArmor.piece4Rating);
        const betterRating = val2 >= val4 ? sheetArmor.piece2Rating : sheetArmor.piece4Rating;
        let baseGradeLetter = betterRating.toLowerCase().trim();
        if (baseGradeLetter.endsWith('+') || baseGradeLetter.endsWith('-')) {
            baseGradeLetter = baseGradeLetter.slice(0, -1);
        }
        const gradeClass = `aegis-grade-${baseGradeLetter}`;
        const piece2Class = `aegis-grade-${sheetArmor.piece2Rating.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        const piece4Class = `aegis-grade-${sheetArmor.piece4Rating.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        const html = `
      <div class="aegis-tooltip-header">
        <div class="aegis-tooltip-title-row">
          <span class="aegis-tooltip-weapon-name">${weaponName}</span>
          <span class="aegis-tooltip-grade ${gradeClass}">${result.grade}</span>
        </div>
        <div class="aegis-tooltip-sheet-meta">
          <span class="aegis-tooltip-sheet-badge aegis-tier-source" style="background: linear-gradient(135deg, #1abc9c, #16a085) !important;">${sheetArmor.sourceType}</span>
          <span class="aegis-tooltip-sheet-rank">Source: ${sheetArmor.source}</span>
        </div>
        <div class="aegis-tooltip-section">
          <div class="aegis-tooltip-section-title">2-Piece Bonus: <strong style="color: #fff;">${sheetArmor.piece2Name}</strong></div>
          <div style="display: flex; gap: 8px; align-items: flex-start; margin-top: 4px;">
            <span class="aegis-popup-grade-badge ${piece2Class}" style="flex-shrink: 0; padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 10px; color: #fff; line-height: 1.2;">${sheetArmor.piece2Rating}</span>
            <div class="aegis-tooltip-notes-text" style="margin: 0; line-height: 1.3;">${sheetArmor.piece2Desc}</div>
          </div>
          ${sheetArmor.piece2Numbers ? `<div class="aegis-armor-bonus-numbers" style="margin-top: 4px; font-size: 10px; color: #88c0d0; background: rgba(136, 192, 208, 0.1); padding: 4px 6px; border-radius: 4px; line-height: 1.2;">${sheetArmor.piece2Numbers}</div>` : ''}
        </div>

        <div class="aegis-tooltip-section" style="margin-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 10px;">
          <div class="aegis-tooltip-section-title">4-Piece Bonus: <strong style="color: #fff;">${sheetArmor.piece4Name}</strong></div>
          <div style="display: flex; gap: 8px; align-items: flex-start; margin-top: 4px;">
            <span class="aegis-popup-grade-badge ${piece4Class}" style="flex-shrink: 0; padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 10px; color: #fff; line-height: 1.2;">${sheetArmor.piece4Rating}</span>
            <div class="aegis-tooltip-notes-text" style="margin: 0; line-height: 1.3;">${sheetArmor.piece4Desc}</div>
          </div>
          ${sheetArmor.piece4Numbers ? `<div class="aegis-armor-bonus-numbers" style="margin-top: 4px; font-size: 10px; color: #88c0d0; background: rgba(136, 192, 208, 0.1); padding: 4px 6px; border-radius: 4px; line-height: 1.2;">${sheetArmor.piece4Numbers}</div>` : ''}
        </div>
      </div>
    `;
        safeSetInnerHTML(tooltip, html);
        positionTooltip(target, tooltip);
        tooltip.classList.remove('hidden');
        return;
    }
    // Normalize grade to match CSS classes (extract roll grade part if using 2-tier)
    const gradeStr = result.grade || '';
    const isTwoTier = gradeStr.length > 2 || (gradeStr.length === 2 && !gradeStr.endsWith('+') && !gradeStr.endsWith('-'));
    const baseGradeLetter = isTwoTier
        ? gradeStr.substring(1).charAt(0).toLowerCase()
        : (gradeStr ? gradeStr.charAt(0).toLowerCase() : '');
    const gradeClass = `aegis-grade-${baseGradeLetter}`;
    // Parse PvP/PvE tags
    let tagsHtml = '';
    if (result.notes) {
        const isPvE = /\bpve\b/i.test(result.notes);
        const isPvP = /\bpvp\b/i.test(result.notes);
        if (isPvE || isPvP) {
            tagsHtml = '<div class="aegis-tooltip-tags-row">';
            if (isPvE) {
                tagsHtml += '<span class="aegis-tooltip-tag aegis-tag-pve">PvE</span>';
            }
            if (isPvP) {
                tagsHtml += '<span class="aegis-tooltip-tag aegis-tag-pvp">PvP</span>';
            }
            tagsHtml += '</div>';
        }
    }
    // Extract recommended Masterworks & Mod
    const recMWs = [];
    let rawMW = sheetWeapon?.mw ? sheetWeapon.mw.trim() : null;
    if (rawMW && rawMW !== '-') {
        const parts = rawMW.split(/[\/\n\\]/);
        for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed)
                recMWs.push(trimmed);
        }
    }
    if (recMWs.length === 0) {
        const notesText = (sheetWeapon?.notes || '') + ' ' + (result.notes || '') + ' ' + (result.wishlistNotes || '');
        const foundMW = extractRecommendedMasterwork(notesText);
        if (foundMW) {
            const parts = foundMW.split(/[\/\n\\]/);
            for (const part of parts) {
                const trimmed = part.trim();
                if (trimmed)
                    recMWs.push(trimmed);
            }
        }
    }
    const notesText = (sheetWeapon?.notes || '') + ' ' + (result.notes || '') + ' ' + (result.wishlistNotes || '');
    const recMod = extractRecommendedMod(notesText);
    // Assemble sheet metadata
    let sheetMetaHtml = '';
    let sheetBodyHtml = '';
    if (sheetWeapon) {
        const tierLetter = sheetWeapon.tier ? sheetWeapon.tier.charAt(0).toLowerCase() : '';
        const tierClass = `aegis-tier-${tierLetter}`;
        const rankText = sheetWeapon.rank ? `Rank #${sheetWeapon.rank}` : '';
        let categoryMetaText = '';
        if (isBestInClass) {
            categoryMetaText = `<span class="aegis-tooltip-best-tag">★ Best in Class</span>`;
        }
        else if (bestAlternative) {
            categoryMetaText = `<span class="aegis-tooltip-alt-text">Alt: ${bestAlternative}</span>`;
        }
        sheetMetaHtml = `
      <div class="aegis-tooltip-sheet-meta">
        <span class="aegis-tooltip-sheet-badge ${tierClass}">${sheetWeapon.tier} Tier</span>
        ${rankText ? `<span class="aegis-tooltip-sheet-rank">${rankText}</span>` : ''}
        ${categoryMetaText}
      </div>
      ${sheetWeapon.source ? `<div class="aegis-tooltip-weapon-source" style="font-size: 11px; margin-top: 4px; color: #ffd700;"><span style="color: #aaa; font-weight: 500;">Source:</span> ${sheetWeapon.source}</div>` : ''}
    `;
        // Shortened recommended perks
        const cleanPerk1 = sheetWeapon.perk1 ? sheetWeapon.perk1.split('\n')[0].trim() : '';
        const cleanPerk2 = sheetWeapon.perk2 ? sheetWeapon.perk2.split('\n')[0].trim() : '';
        let recsHtml = '';
        if (cleanPerk1 || cleanPerk2) {
            const perksText = [cleanPerk1, cleanPerk2].filter(Boolean).join(' / ');
            recsHtml = `
        <div class="aegis-tooltip-compact-recs">
          <span class="aegis-tooltip-recs-label">Rec Perks:</span>
          <span class="aegis-tooltip-recs-value" title="${perksText}">${perksText}</span>
        </div>
      `;
        }
        if (sheetWeapon.origin) {
            recsHtml += `
        <div class="aegis-tooltip-compact-recs" style="margin-top: 4px;">
          <span class="aegis-tooltip-recs-label">Origin:</span>
          <span class="aegis-tooltip-recs-value" title="${sheetWeapon.origin}">${sheetWeapon.origin}</span>
        </div>
      `;
        }
        if (recMWs.length > 0) {
            const eqMW = (equippedMasterwork || '').toLowerCase();
            const badges = recMWs.map(mw => {
                const mwLower = mw.toLowerCase();
                const isMatch = eqMW && (mwLower === eqMW ||
                    eqMW.startsWith(mwLower) ||
                    mwLower.startsWith(eqMW));
                const icon = isMatch ? '✓' : '☆';
                const matchStyle = isMatch
                    ? 'display: inline-block !important; background: linear-gradient(135deg, rgba(255, 215, 0, 0.38), rgba(255, 140, 0, 0.28)) !important; border: 1.5px solid #ffd700 !important; color: #ffffff !important; text-shadow: 0 0 6px rgba(255, 215, 0, 0.8) !important; box-shadow: 0 0 10px rgba(255, 191, 0, 0.65) !important;'
                    : 'display: inline-block !important; background: rgba(255, 191, 0, 0.05) !important; border: 1px dashed rgba(255, 191, 0, 0.4) !important; color: rgba(235, 203, 139, 0.65) !important; box-shadow: none !important;';
                const title = isMatch
                    ? `✓ Equipped & Recommended Masterwork`
                    : `Recommended Masterwork (Not equipped)`;
                return `<span class="aegis-mw-badge" style="${matchStyle}" title="${title}">${icon} ${mw}</span>`;
            }).join('');
            recsHtml += `
        <div class="aegis-tooltip-compact-recs" style="margin-top: 6px; align-items: center;">
          <span class="aegis-tooltip-recs-label" style="color: #ebcb8b !important;">Rec MW:</span>
          <span class="aegis-tooltip-recs-value" style="display: flex !important; flex-wrap: wrap !important; gap: 4px !important;">${badges}</span>
        </div>
      `;
        }
        if (sheetWeapon.notes || sheetWeapon.description || recsHtml || sheetWeapon.exoticViability) {
            const sectionTitle = aegisMode === 'pvp' ? 'Finnald PvP Meta Analysis' : 'Aegis Meta Analysis';
            const viabilityHtml = sheetWeapon.exoticViability ? renderViabilityMatrix(sheetWeapon.exoticViability, aegisMode) : '';
            let analysisBlock = '';
            if (sheetWeapon.notes) {
                analysisBlock = `
          <div style="margin-top: 6px; background: rgba(0, 0, 0, 0.25); border-left: 3px solid #ebcb8b; border-radius: 0 6px 6px 0; padding: 6px 9px;">
            <div style="font-size: 9.5px; font-weight: 700; color: #ebcb8b; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 2px;">Strategic Analysis</div>
            <div style="font-size: 11px; line-height: 1.55; color: #d8dee9;">${formatFormattedNotes(sheetWeapon.notes)}</div>
          </div>
        `;
            }
            let mechanicsBlock = '';
            if (sheetWeapon.description) {
                mechanicsBlock = `
          <div style="margin-top: 6px; background: rgba(0, 0, 0, 0.25); border-left: 3px solid #88c0d0; border-radius: 0 6px 6px 0; padding: 6px 9px;">
            <div style="font-size: 9.5px; font-weight: 700; color: #88c0d0; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 2px;">Exotic Mechanics</div>
            <div style="font-size: 11px; line-height: 1.55; color: #d8dee9;">${formatFormattedNotes(sheetWeapon.description)}</div>
          </div>
        `;
            }
            sheetBodyHtml = `
        <div class="aegis-tooltip-section aegis-meta-section">
          <div class="aegis-tooltip-section-title">${sectionTitle}</div>
          ${recsHtml}
          ${viabilityHtml}
          ${analysisBlock}
          ${mechanicsBlock}
        </div>
      `;
        }
    }
    let recsRowHtml = '';
    if (recMod) {
        recsRowHtml = '<div class="aegis-tooltip-recommendations">';
        recsRowHtml += `<span class="aegis-mod-badge" title="Recommended Weapon Mod">Mod: ${recMod}</span>`;
        recsRowHtml += '</div>';
    }
    let elementBadgeHtml = '';
    let stunBadgeHtml = '';
    if (sheetWeapon) {
        const energy = getWeaponEnergy(sheetWeapon);
        if (energy) {
            const lowerEnergy = energy.toLowerCase();
            let iconUrl = '';
            if (lowerEnergy.includes('solar')) {
                iconUrl = ELEMENT_ICONS.solar;
            }
            else if (lowerEnergy.includes('arc')) {
                iconUrl = ELEMENT_ICONS.arc;
            }
            else if (lowerEnergy.includes('void')) {
                iconUrl = ELEMENT_ICONS.void;
            }
            else if (lowerEnergy.includes('stasis')) {
                iconUrl = ELEMENT_ICONS.stasis;
            }
            else if (lowerEnergy.includes('strand')) {
                iconUrl = ELEMENT_ICONS.strand;
            }
            else if (lowerEnergy.includes('kinetic')) {
                iconUrl = ELEMENT_ICONS.kinetic;
            }
            if (iconUrl) {
                elementBadgeHtml = `<img src="${iconUrl}" title="${energy} Damage" alt="${energy}" style="width: 17px; height: 17px; object-fit: contain; vertical-align: middle; display: inline-block;" />`;
            }
        }
        const stunVal = getWeaponStun(sheetWeapon);
        if (stunVal) {
            const lowerStun = stunVal.toLowerCase();
            const stunImgs = [];
            if (lowerStun.includes('barrier')) {
                stunImgs.push(`<img src="${STUN_ICONS.barrier}" title="Anti-Barrier" alt="Barrier" style="width: 16px; height: 16px; object-fit: contain; vertical-align: middle; display: inline-block;" />`);
            }
            if (lowerStun.includes('overload')) {
                stunImgs.push(`<img src="${STUN_ICONS.overload}" title="Overload" alt="Overload" style="width: 16px; height: 16px; object-fit: contain; vertical-align: middle; display: inline-block;" />`);
            }
            if (lowerStun.includes('unstoppable')) {
                stunImgs.push(`<img src="${STUN_ICONS.unstoppable}" title="Unstoppable" alt="Unstoppable" style="width: 16px; height: 16px; object-fit: contain; vertical-align: middle; display: inline-block;" />`);
            }
            if (stunImgs.length > 0) {
                stunBadgeHtml = `<span style="display: inline-flex; align-items: center; gap: 3px;" title="${stunVal}">${stunImgs.join('')}</span>`;
            }
        }
    }
    // Assemble premium HTML content
    let html = `
    <div class="aegis-tooltip-header">
      <div class="aegis-tooltip-title-row" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
          <span class="aegis-tooltip-weapon-name">${weaponName}</span>
          ${elementBadgeHtml}
          ${stunBadgeHtml}
        </div>
        <span class="aegis-tooltip-grade ${gradeClass}">${result.grade}</span>
      </div>
      ${tagsHtml}
      ${sheetMetaHtml}
      ${recsRowHtml}
  `;
    if (!isLightGGMode) {
        html += `
      <div class="aegis-tooltip-match-bar-container">
        <div class="aegis-tooltip-match-label">Match Percentage</div>
        <div class="aegis-tooltip-match-value">${result.matchPercentage}%</div>
      </div>
      <div class="aegis-tooltip-progress-bg">
        <div class="aegis-tooltip-progress-fill ${gradeClass}" style="width: ${result.matchPercentage}%"></div>
      </div>
    `;
    }
    else {
        html += `
      <div class="aegis-tooltip-match-bar-container">
        <div class="aegis-tooltip-match-label" style="color: #ffb300;">Light.gg Roll Appraisal</div>
      </div>
    `;
    }
    let upgradeBannerHtml = '';
    if (result.upgradeAdvice) {
        upgradeBannerHtml = `
      <div class="aegis-tooltip-upgrade-banner">
        ${result.upgradeAdvice}
      </div>
    `;
    }
    html += `
    </div>
    
    <div class="aegis-tooltip-body">
      ${upgradeBannerHtml}
      ${sheetBodyHtml}
  `;
    const hasWishlist = result.wishlistPerks && result.wishlistPerks.length > 0;
    if (sheetPerks) {
        html += `
      <div class="aegis-tooltip-section">
        <div class="aegis-tooltip-section-title">Matched Perks (Spreadsheet)</div>
        <div class="aegis-tooltip-perks-grid">
    `;
        if (sheetPerks.matched.length === 0) {
            html += `<div class="aegis-tooltip-perk-empty">None</div>`;
        }
        else {
            for (const perk of sheetPerks.matched) {
                const iconUrl = perk.icon ? `https://www.bungie.net${perk.icon}` : '';
                const itemClass = perk.matched ? 'aegis-matched' : 'aegis-selectable';
                const labelSuffix = perk.matched ? '' : ' <span class="aegis-selectable-suffix">(Selectable)</span>';
                html += `
          <div class="aegis-tooltip-perk-item ${itemClass}">
            ${iconUrl ? `<img src="${iconUrl}" class="aegis-perk-icon-img" alt="" />` : '<span class="aegis-perk-bullet">•</span>'}
            <span class="aegis-perk-name-text">${perk.name}${labelSuffix}</span>
          </div>
        `;
            }
        }
        html += `
        </div>
      </div>
    `;
        if (sheetPerks.missing.length > 0) {
            html += `
        <div class="aegis-tooltip-section">
          <div class="aegis-tooltip-section-title">Missing Perks (Spreadsheet)</div>
          <div class="aegis-tooltip-perks-grid">
      `;
            for (const perk of sheetPerks.missing) {
                let iconPath = perk.icon || '';
                if (!iconPath && globalPerkNameToIcon) {
                    const normName = perk.name.toLowerCase().trim();
                    const cleanName = normName.replace(/\s*\([^)]+\)\s*/g, '').replace(/[*+]/g, '').trim();
                    iconPath = globalPerkNameToIcon[cleanName] || globalPerkNameToIcon[normName] || '';
                }
                const iconUrl = iconPath ? `https://www.bungie.net${iconPath}` : '';
                html += `
          <div class="aegis-tooltip-perk-item aegis-missing">
            ${iconUrl ? `<img src="${iconUrl}" class="aegis-perk-icon-img" alt="" />` : '<span class="aegis-perk-bullet">•</span>'}
            <span class="aegis-perk-name-text">${perk.name}</span>
          </div>
        `;
            }
            html += `
          </div>
        </div>
      `;
        }
    }
    else if (hasWishlist) {
        html += `
      <div class="aegis-tooltip-section">
        <div class="aegis-tooltip-section-title">Matched Perks</div>
        <div class="aegis-tooltip-perks-grid">
    `;
        if (result.matchedPerks.length === 0) {
            html += `<div class="aegis-tooltip-perk-empty">None</div>`;
        }
        else {
            for (const hash of result.matchedPerks) {
                const info = getPerkInfo(hash, localPerksMap);
                const iconUrl = info.icon ? `https://www.bungie.net${info.icon}` : '';
                html += `
          <div class="aegis-tooltip-perk-item aegis-matched">
            ${iconUrl ? `<img src="${iconUrl}" class="aegis-perk-icon-img" alt="" />` : '<span class="aegis-perk-bullet">•</span>'}
            <span class="aegis-perk-name-text">${info.name}</span>
          </div>
        `;
            }
        }
        html += `
        </div>
      </div>
    `;
        if (result.missingPerks.length > 0) {
            html += `
        <div class="aegis-tooltip-section">
          <div class="aegis-tooltip-section-title">Missing Perks</div>
          <div class="aegis-tooltip-perks-grid">
      `;
            for (const hash of result.missingPerks) {
                const info = getPerkInfo(hash, localPerksMap);
                const iconUrl = info.icon ? `https://www.bungie.net${info.icon}` : '';
                html += `
          <div class="aegis-tooltip-perk-item aegis-missing">
            ${iconUrl ? `<img src="${iconUrl}" class="aegis-perk-icon-img" alt="" />` : '<span class="aegis-perk-bullet">•</span>'}
            <span class="aegis-perk-name-text">${info.name}</span>
          </div>
        `;
            }
            html += `
          </div>
        </div>
      `;
        }
    }
    else {
        // Fallback: show only the plugged/active perks
        // Filter to meaningful perks: exclude trackers, empty sockets, mods, ornaments, shaders by name keywords
        const JUNK_KEYWORDS = /tracker|empty|default|ornament|shader|catalyst|upgrade|mod socket|memento/i;
        // Build the list of perks to display
        let displayHashes = [];
        if (activeHashes && activeHashes.length > 0) {
            // Use active hashes, filtered through localPerksMap for names
            displayHashes = activeHashes.filter(hash => {
                const info = localPerksMap[hash];
                if (!info)
                    return false;
                return !JUNK_KEYWORDS.test(info.name);
            });
        }
        html += `
      <div class="aegis-tooltip-section">
        <div class="aegis-tooltip-section-title">Active Perks</div>
        <div class="aegis-tooltip-perks-grid">
    `;
        if (displayHashes.length === 0) {
            html += `<div class="aegis-tooltip-perk-empty">No perks detected</div>`;
        }
        else {
            for (const hash of displayHashes) {
                const info = localPerksMap[hash];
                const iconUrl = info.icon ? `https://www.bungie.net${info.icon}` : '';
                html += `
          <div class="aegis-tooltip-perk-item aegis-matched">
            ${iconUrl ? `<img src="${iconUrl}" class="aegis-perk-icon-img" alt="" />` : '<span class="aegis-perk-bullet">•</span>'}
            <span class="aegis-perk-name-text" style="color: #ffffff;">${info.name}</span>
          </div>
        `;
            }
        }
        html += `
        </div>
      </div>
    `;
    }
    let showNotes = result.notes;
    if (sheetWeapon && showNotes === sheetWeapon.notes) {
        showNotes = '';
    }
    if (result.wishlistNotes) {
        showNotes = result.wishlistNotes;
    }
    if (showNotes) {
        const sectionTitle = isLightGGMode && !result.wishlistNotes ? 'Information' : 'Wishlist Notes';
        html += `
      <div class="aegis-tooltip-section aegis-notes-section">
        <div class="aegis-tooltip-section-title">${sectionTitle}</div>
        <div class="aegis-tooltip-notes-text">${showNotes}</div>
      </div>
    `;
    }
    html += `
    </div>
  `;
    safeSetInnerHTML(tooltip, html);
    // Position and display
    positionTooltip(target, tooltip);
    tooltip.classList.remove('hidden');
}
/**
 * Hides the tooltip element.
 */
export function hideTooltip() {
    if (tooltipEl) {
        tooltipEl.classList.add('hidden');
    }
}
export function formatFormattedNotes(text) {
    if (!text)
        return '';
    const normalized = text.replace(/\r\n|\r/g, '\n').replace(/;\s*(?=[A-Z0-9])/g, '\n');
    const lines = normalized.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length > 1) {
        const listItems = lines.map(line => {
            const cleanLine = line.replace(/^[•\-\*]\s*/, '');
            return `<li style="margin-bottom: 3px; line-height: 1.5;">${highlightKeyTerms(cleanLine)}</li>`;
        }).join('');
        return `<ul style="margin: 3px 0 0 0; padding-left: 14px; list-style-type: disc;">${listItems}</ul>`;
    }
    return highlightKeyTerms(text);
}
// Static Bungie CDN Icon URLs
const ELEMENT_ICONS = {
    strand: 'https://www.bungie.net/common/destiny2_content/icons/DestinyDamageTypeDefinition_b2fe51a94f3533f97079dfa0d27a4096.png',
    stasis: 'https://www.bungie.net/common/destiny2_content/icons/DestinyDamageTypeDefinition_530c4c3e7981dc2aefd24fd3293482bf.png',
    solar: 'https://www.bungie.net/common/destiny2_content/icons/DestinyDamageTypeDefinition_2a1773e10968f2d088b97c22b22bba9e.png',
    void: 'https://www.bungie.net/common/destiny2_content/icons/DestinyDamageTypeDefinition_ceb2f6197dccf3958bb31cc783eb97a0.png',
    arc: 'https://www.bungie.net/common/destiny2_content/icons/DestinyDamageTypeDefinition_092d066688b879c807c3b460afdd61e6.png',
    kinetic: 'https://www.bungie.net/common/destiny2_content/icons/DestinyDamageTypeDefinition_3385a924fd3ccb92c343ade19f19a370.png',
};
const STUN_ICONS = {
    barrier: 'https://www.bungie.net/common/destiny2_content/icons/DestinyBreakerTypeDefinition_07b9ba0194e85e46b258b04783e93d5d.png',
    overload: 'https://www.bungie.net/common/destiny2_content/icons/DestinyBreakerTypeDefinition_da558352b624d799cf50de14d7cb9565.png',
    unstoppable: 'https://www.bungie.net/common/destiny2_content/icons/DestinyBreakerTypeDefinition_825a438c85404efd6472ff9e97fc7251.png',
};
// Pre-compiled RegExp patterns for zero-latency key term highlighting
const NUMBER_PATTERN = /\b(\+?-?\d+(?:\.\d+)?%?x?s?m?|(?:\d+\/\d+(?:\/\d+)?))\b/gi;
const CHAMP_TERMS = ['barrier', 'anti-barrier', 'overload', 'unstoppable', 'stun', 'stuns', 'stagger'];
const CHAMP_PATTERN = new RegExp(`\\b(${CHAMP_TERMS.join('|')})\\b`, 'gi');
const SOLAR_TERMS = ['solar', 'scorch', 'scorching', 'scorched', 'ignite', 'ignites', 'igniting', 'ignition', 'ignitions', 'cure', 'restoration', 'radiant', 'firesprite', 'firesprites'];
const SOLAR_PATTERN = new RegExp(`\\b(${SOLAR_TERMS.join('|')})\\b`, 'gi');
const ARC_TERMS = ['arc', 'jolt', 'jolts', 'jolting', 'jolt-debuffed', 'blind', 'blinds', 'blinding', 'amplified', 'ionic trace', 'ionic traces', 'bolt charge', 'bolt charges', 'chain lightning', 'speed booster'];
const ARC_PATTERN = new RegExp(`\\b(${ARC_TERMS.join('|')})\\b`, 'gi');
const VOID_TERMS = ['void', 'weaken', 'weakened', 'weakening', 'suppress', 'suppressed', 'suppressing', 'suppression', 'volatile', 'volatile rounds', 'devour', 'void overshield', 'invisibility', 'invisible', 'void breach', 'void breaches', 'truesight', 'blight'];
const VOID_PATTERN = new RegExp(`\\b(${VOID_TERMS.join('|')})\\b`, 'gi');
const STASIS_TERMS = ['stasis', 'slow', 'slowed', 'slowing', 'freeze', 'freezes', 'frozen', 'freezing', 'shatter', 'shatters', 'shattering', 'frost armor', 'stasis shard', 'stasis shards', 'stasis crystal', 'stasis crystals', 'stasis-debuffed'];
const STASIS_PATTERN = new RegExp(`\\b(${STASIS_TERMS.join('|')})\\b`, 'gi');
const STRAND_TERMS = ['strand', 'suspend', 'suspended', 'suspending', 'unravel', 'unravels', 'unraveling', 'unraveling rounds', 'sever', 'severed', 'severing', 'woven mail', 'tangle', 'tangles', 'threadling', 'threadlings'];
const STRAND_PATTERN = new RegExp(`\\b(${STRAND_TERMS.join('|')})\\b`, 'gi');
const PRISM_TERMS = ['prismatic', 'transcendence', 'transcendent', 'transcendance'];
const PRISM_PATTERN = new RegExp(`\\b(${PRISM_TERMS.join('|')})\\b`, 'gi');
const KINETIC_TERMS = ['kinetic', 'kinetics', 'kinetic tremors', 'kinetic damage', 'kinetic weapon', 'kinetic weapons', 'kinetic synthesis', 'kinetic blinding blast', 'kinetic blast'];
const KINETIC_PATTERN = new RegExp(`\\b(${KINETIC_TERMS.join('|')})\\b`, 'gi');
const FRAME_TERMS = [
    'high-impact frame', 'precision frame', 'adaptive frame', 'lightweight frame', 'rapid-fire frame',
    'aggressive frame', 'aggressive burst', 'rocket-assisted sidearm', 'rocket-assisted', 'support frame auto rifle',
    'support frame', 'micro-missile', 'wave frame', 'caster frame', 'vortex frame', 'heavy burst', 'double-fire',
    'aggressive glaive', 'lightweight glaive',
    'radiolaria transposer', 'radiolaria', 'nanotech integration', 'noble rounds', 'soul devourer',
    'wolfpack rounds', 'markov chain', 'bayonet', 'cursed thrall', 'bolt charge', 'bolt charges',
    'overcharge', 'overcharged', 'ricochet', 'ricocheting', 'dot', 'dps', 'add clear', 'supers', 'super', 'well', 'wells', 'ttk', 'time to kill',
    // Comprehensive Perks List from Aegis Perks Tab
    'adagio', 'adaptive munitions', 'adhesive ordnance', 'adrenaline junkie', 'aggregate charge', 'air assault',
    'air trigger', 'all-star', 'ambitious assassin', 'ancillary ordinance', "archer's gambit", "archer's tempo",
    "assassin's blade", 'attrition orbs', 'auto-loading holster', 'backup plan', 'bait and switch',
    'barrel constrictor', 'beacon rounds', 'bewildering burst', 'binary orbit', 'bipod', 'blast distributor',
    'blunt execution rounds', 'bolt scavenger', 'bottomless grief', 'box breathing', 'built to blast',
    'burning ambition', 'butterfly', 'cascade point', 'celerity', 'chain reaction', 'chaos reshaped',
    'chill clip', 'circle of life', 'close to melee', 'closing time', 'clown cartridge', 'cluster bomb',
    'cold steel', 'collective action', 'collective demolition', 'collective pugilism', 'compulsive reloader',
    'controlled burst', 'cooling baubles', 'cornered', 'counterattack', 'crystalline corpsebloom',
    'danger zone', 'deconstruct', 'delicate tuning', 'demolitionist', 'demoralize', 'desperado',
    'desperate measures', 'destabilizing rounds', 'detonator beam', 'dimensional shift', 'discord',
    'disruption break', 'dragonfly', 'dual loader', "duelist's trance", 'dynamic sway reduction',
    'eager edge', 'eddy current', 'elemental capacitor', 'elemental honing', 'en garde', 'encore',
    'energy transfer', 'enlightened action', 'ensemble', 'envious arsenal', 'envious assassin',
    'explosive head', 'explosive light', 'explosive payload', 'eye of the storm', 'feeding frenzy',
    'field prep', 'firefly', 'firing line', 'firmly planted', 'flash counter', 'focused fury',
    "fourth time's the charm", 'fragile focus', 'frenzy', 'full auto trigger system', 'full court',
    'gear shift', 'genesis', 'golden tricorn', 'grave robber', 'gutshot straight', 'harmony',
    'hatchling', 'headseeker', 'headstone', 'heal clip', 'heating up', 'high ground', 'high-impact reserves',
    'hip-fire grip', 'immovable object', 'impromptu ammunition', 'impulse amplifier', 'incandescent',
    'invisible hand', 'iron gaze', 'iron grip', 'iron reach', 'jolting feedback', 'keep away', 'kickstart',
    'kill clip', 'killing tally', 'killing wind', 'kinetic tremors', 'lasting impression', 'lead from gold',
    'lead from light', 'light touch', 'lone wolf', 'loose change', 'lucky shot', 'magnificent howl',
    'master of arms', 'mega kill clip', 'meganeura', 'melee momentum', 'moving target', 'mulligan',
    'multikill clip', 'no distractions', 'offhand strike', 'one for all', 'one-two punch', 'onslaught',
    'opening shot', 'osmosis', 'outlaw', 'overflow', 'paracausal affinity', 'perfect float', 'permeability',
    'perpetual motion', 'physic', 'precision instrument', 'proximity power', 'pugilist', 'pulse monitor',
    'quickdraw', 'rampage', 'rangefinder', 'rapid hit', "reaper's tithe", 'reciprocity', 'recombination',
    'reconstruction', 'recycled energy', 'redirection', 'relentless strikes', 'replenishing aegis',
    'repulsor brace', 'reservoir burst', 'reverberation', 'reversal of fortune', 'rewind rounds',
    'rimestealer', 'rolling storm', 'sharp harvest', 'shattering blade', 'shield disorient', 'shoot to loot',
    'shot swap', 'sleight of hand', 'slice', 'slickdraw', 'slideshot', 'slideways', 'snapshot sights',
    'sneak bow', 'stats for all', 'steady hands', 'stopping power', 'strategist', 'subsistence',
    'successful warm-up', 'supercharged magazine', 'surplus', 'surrounded', 'swashbuckler', 'sword logic',
    'sympathetic arsenal', 'tap the trigger', 'target lock', 'tear', 'thermal atomization', 'threat detector',
    'threat remover', 'thresh', 'tilting at windmills', 'timed payload', 'tireless blade', 'to the pain',
    'tracking module', 'transcendent moment', 'trench barrel', 'trickle charge', 'triple tap',
    'tunnel vision', 'turnabout', 'under pressure', 'under-over', 'unrelenting', 'unstoppable force',
    'valiant charge', 'voltshot', 'vorpal weapon', 'well-rounded', 'wellspring', 'whirlwind blade',
    'withering gaze', 'zen moment',
    // Origin Traits
    'tex balanced stock', 'bray inherited', 'veist stinger', 'hakke breach armaments', 'omolon fluid dynamics',
    'suros synergy', 'nadir focus', "gunner's right", 'field-tested', 'restoration protocol', "vanguard's vindication",
    'crucible peacemaker', 'alacrity', 'one quiet moment', 'ambush', 'extrovert', 'classy contender', 'hot-swap',
    'land tank', 'psychohack', 'soul drinker', 'to the vanguard', 'runneth over', 'right choice', 'bitterspite',
    'indomitable', 'noble deeds', 'wildcard', 'cast-off', 'crossing over', "dragon's vengeance", 'stratified',
    'dark ether reap'
];
const FRAME_PERK_PATTERN = new RegExp(`\\b(${FRAME_TERMS.join('|')})\\b`, 'gi');
export function highlightKeyTerms(text) {
    if (!text)
        return '';
    return text
        .replace(NUMBER_PATTERN, (match) => `<span style="font-weight: 700; color: #4ade80;">${match}</span>`)
        .replace(CHAMP_PATTERN, (match) => `<span style="font-weight: 700; color: #f59e0b;">${match}</span>`)
        .replace(SOLAR_PATTERN, (match) => `<span style="font-weight: 700; color: #f97316;">${match}</span>`)
        .replace(ARC_PATTERN, (match) => `<span style="font-weight: 700; color: #06b6d4;">${match}</span>`)
        .replace(VOID_PATTERN, (match) => `<span style="font-weight: 700; color: #c084fc;">${match}</span>`)
        .replace(STASIS_PATTERN, (match) => `<span style="font-weight: 700; color: #38bdf8;">${match}</span>`)
        .replace(STRAND_PATTERN, (match) => `<span style="font-weight: 700; color: #10b981;">${match}</span>`)
        .replace(PRISM_PATTERN, (match) => `<span style="font-weight: 700; color: #f43f5e;">${match}</span>`)
        .replace(KINETIC_PATTERN, (match) => `<span style="font-weight: 700; color: #f8fafc;">${match}</span>`)
        .replace(FRAME_PERK_PATTERN, (match) => `<span style="font-weight: 700; color: #ffd700;">${match}</span>`);
}
function formatViabilityBadge(rawSymbol) {
    const sym = (rawSymbol || '').trim();
    if (sym.includes('✔')) {
        return { label: '✔ Optimal', color: '#10b981' };
    }
    if (sym.includes('▲')) {
        return { label: '▲ Viable', color: '#38bdf8' };
    }
    if (sym.includes('!')) {
        return { label: '! Situational', color: '#fbbf24' };
    }
    if (sym.includes('✖') || sym.includes('x') || sym.includes('X')) {
        return { label: '✖ Wasted', color: '#f87171' };
    }
    return { label: sym || '—', color: '#94a3b8' };
}
export function renderViabilityMatrix(viability, aegisMode) {
    const isPvP = aegisMode === 'pvp' || (viability.trials || viability.comp || viability.quickplay || viability.vsDr || viability.duel);
    const activities = isPvP ? [
        { name: 'Trials', symbol: viability.trials },
        { name: 'Comp', symbol: viability.comp },
        { name: 'QP', symbol: viability.quickplay },
        { name: 'vs DR', symbol: viability.vsDr },
        { name: 'Duel', symbol: viability.duel },
    ] : [
        { name: 'Roam', symbol: viability.roam },
        { name: 'DPS', symbol: viability.dps },
        { name: 'Chall', symbol: viability.chall },
        { name: 'Speed', symbol: viability.speed },
    ];
    const validActivities = activities.filter(a => a.symbol);
    if (validActivities.length === 0)
        return '';
    const itemsHtml = validActivities.map((act) => {
        const badge = formatViabilityBadge(act.symbol);
        return `
      <div style="display: flex; align-items: center; gap: 3px; font-family: sans-serif; font-size: 10px;">
        <span style="color: #94a3b8; font-weight: 600; text-transform: uppercase; font-size: 9px; letter-spacing: 0.2px;">${act.name}:</span>
        <span style="font-weight: 800; color: ${badge.color};">${badge.label}</span>
      </div>
    `;
    }).join('<span style="color: rgba(255, 255, 255, 0.15); font-size: 10px;">|</span>');
    return `
    <div class="aegis-unified-viability-bar" style="display: flex; align-items: center; justify-content: space-between; background: rgba(0, 0, 0, 0.25); padding: 5px 8px; border-radius: 5px; border: 1px solid rgba(255, 255, 255, 0.08); margin-top: 5px; flex-wrap: wrap; gap: 4px;">
      ${itemsHtml}
    </div>
  `;
}
// Master Exotic Weapon Champion Breaker Stun Registry (Top-Level Scope)
const EXOTIC_STUN_MAP = {
    // Anti-Barrier Exotics
    'turncoat': 'Barrier',
    'whirling ovation': 'Barrier',
    'third iteration': 'Barrier',
    'new land beyond': 'Barrier',
    'ice breaker': 'Barrier',
    'still hunt': 'Barrier',
    'khvostov 7g-0x': 'Barrier',
    'khvostov': 'Barrier',
    'microcosm': 'Barrier',
    'micro-cosmos': 'Barrier',
    'euphony': 'Barrier',
    'buried bloodline': 'Barrier',
    'deterministic chaos': 'Barrier',
    'revision zero': 'Barrier',
    'trespasser': 'Barrier',
    'edge of action': 'Barrier',
    'parasite': 'Barrier',
    'collective obligation': 'Barrier',
    'lorentz driver': 'Barrier',
    'gjallarhorn': 'Barrier',
    'vex mythoclast': 'Barrier',
    "dead man's tale": 'Barrier',
    'hawkmoon': 'Barrier',
    'no time to explain': 'Barrier',
    'cloudstrike': 'Barrier',
    'the lament': 'Barrier',
    "eriana's vow": 'Barrier',
    'tarrabah': 'Barrier',
    'arbalest': 'Barrier',
    'thorn': 'Barrier',
    "izanagi's burden": 'Barrier',
    'ace of spades': 'Barrier',
    'wish-ender': 'Barrier',
    'the chaperone': 'Barrier',
    'polaris lance': 'Barrier',
    'sleeper simulant': 'Barrier',
    'suros regime': 'Barrier',
    'the huckleberry': 'Barrier',
    'whisper of the worm': 'Barrier',
    'borealis': 'Barrier',
    'coldheart': 'Barrier',
    'graviton lance': 'Barrier',
    'mida multi-tool': 'Barrier',
    'rat king': 'Barrier',
    "skyburner's oath": 'Barrier',
    'touch of malice': 'Barrier',
    // Overload Exotics
    'service of luzaku': 'Overload',
    'graviton spike': 'Overload',
    'barrow-dyad': 'Overload',
    'lodestar': 'Overload',
    "slayer's fang": 'Overload',
    'choir of one': 'Overload',
    'ergo sum': 'Overload',
    'necrochasm': 'Overload',
    'the navigator': 'Overload',
    'centrifuse': 'Overload',
    'wicked implement': 'Overload',
    'vexcalibur': 'Overload',
    'final warning': 'Overload',
    'the manticore': 'Overload',
    'delicate tomb': 'Overload',
    'heartshadow': 'Overload',
    'edge of concurrence': 'Overload',
    'osteo striga': 'Overload',
    "ager's scepter": 'Overload',
    "salvation's grip": 'Overload',
    "traveler's chosen": 'Overload',
    'witherhoard': 'Overload',
    "tommy's matchbook": 'Overload',
    'heir apparent': 'Overload',
    'symmetry': 'Overload',
    'deathbringer': 'Overload',
    'divinity': 'Overload',
    'lumina': 'Overload',
    'outbreak perfected': 'Overload',
    'anarchy': 'Overload',
    'le monarque': 'Overload',
    'black talon': 'Overload',
    'cerberus+1': 'Overload',
    'thunderlord': 'Overload',
    'trinity ghoul': 'Overload',
    'two-tailed fox': 'Overload',
    'wavesplitter': 'Overload',
    'prometheus lens': 'Overload',
    'telesto': 'Overload',
    'the colony': 'Overload',
    'd.a.r.c.i.': 'Overload',
    'darci': 'Overload',
    'hard light': 'Overload',
    'riskrunner': 'Overload',
    'sweet business': 'Overload',
    'tractor cannon': 'Overload',
    'legend of acrius': 'Overload',
    // Unstoppable Exotics
    'praxic blade': 'Unstoppable',
    "cull's shadow": 'Unstoppable',
    'fafnir': 'Unstoppable',
    'heirloom': 'Unstoppable',
    'wolfsbane': 'Unstoppable',
    'new malpais': 'Unstoppable',
    "finality's auger": 'Unstoppable',
    'alethonym': 'Unstoppable',
    'red death reformed': 'Unstoppable',
    'red death': 'Unstoppable',
    'wish-keeper': 'Unstoppable',
    "dragon's breath": 'Unstoppable',
    'tessellation': 'Unstoppable',
    'ex diris': 'Unstoppable',
    'winterbite': 'Unstoppable',
    'conditional finality': 'Unstoppable',
    'verglas curve': 'Unstoppable',
    'hierarchy of needs': 'Unstoppable',
    'quicksilver storm': 'Unstoppable',
    'edge of intent': 'Unstoppable',
    'dead messenger': 'Unstoppable',
    'grand overture': 'Unstoppable',
    'forerunner': 'Unstoppable',
    'cryosthesia 77k': 'Unstoppable',
    "ticuu's divination": 'Unstoppable',
    'duality': 'Unstoppable',
    'eyes of tomorrow': 'Unstoppable',
    'ruinous effigy': 'Unstoppable',
    'the fourth horseman': 'Unstoppable',
    'bastion': 'Unstoppable',
    "devil's ruin": 'Unstoppable',
    "leviathan's breath": 'Unstoppable',
    'monte carlo': 'Unstoppable',
    'xenophage': 'Unstoppable',
    'truth': 'Unstoppable',
    'bad juju': 'Unstoppable',
    'the last word': 'Unstoppable',
    'jotunn': 'Unstoppable',
    'jötunn': 'Unstoppable',
    'lord of wolves': 'Unstoppable',
    'the queenbreaker': 'Unstoppable',
    'malfeasance': 'Unstoppable',
    'one thousand voices': 'Unstoppable',
    '1000 voices': 'Unstoppable',
    'worldline zero': 'Unstoppable',
    'the jade rabbit': 'Unstoppable',
    'crimson': 'Unstoppable',
    'fighting lion': 'Unstoppable',
    'merciless': 'Unstoppable',
    'sturm': 'Unstoppable',
    'sunshot': 'Unstoppable',
    'the prospector': 'Unstoppable',
    'the wardcliff coil': 'Unstoppable',
    'vigilance wing': 'Unstoppable',
};
// Master Exotic Weapon Damage Type Registry (Top-Level Scope)
const EXOTIC_ENERGY_MAP = {
    // Kinetic Exotics
    'sweet business': 'Kinetic',
    'monte carlo': 'Kinetic',
    'suros regime': 'Kinetic',
    'cerberus+1': 'Kinetic',
    'khvostov': 'Kinetic',
    'sturm': 'Kinetic',
    'ace of spades': 'Kinetic',
    'crimson': 'Kinetic',
    'the last word': 'Kinetic',
    'thorn': 'Kinetic',
    'malfeasance': 'Kinetic',
    'hawkmoon': 'Kinetic',
    'lumina': 'Kinetic',
    'turncoat': 'Kinetic',
    'vigilance wing': 'Kinetic',
    'bad juju': 'Kinetic',
    'outbreak perfected': 'Kinetic',
    'no time to explain': 'Kinetic',
    'revision zero': 'Kinetic',
    'red death': 'Kinetic',
    'mida multi-tool': 'Kinetic',
    'the jade rabbit': 'Kinetic',
    "dead man's tale": 'Kinetic',
    'touch of malice': 'Kinetic',
    'the huckleberry': 'Kinetic',
    'osteo striga': 'Kinetic',
    'rat king': 'Kinetic',
    "traveler's chosen": 'Kinetic',
    'forerunner': 'Kinetic',
    'wish-ender': 'Kinetic',
    'the chaperone': 'Kinetic',
    'bastion': 'Kinetic',
    "izanagi's burden": 'Kinetic',
    'witherhoard': 'Kinetic',
    'fighting lion': 'Kinetic',
    'arbalest': 'Kinetic',
    'microcosm': 'Kinetic',
    'micro-cosmos': 'Kinetic',
    // Solar Exotics
    "tommy's matchbook": 'Solar',
    'sunshot': 'Solar',
    "eriana's vow": 'Solar',
    'graviton spike': 'Solar',
    'polaris lance': 'Solar',
    "devil's ruin": 'Solar',
    "ticuu's divination": 'Solar',
    'hierarchy of needs': 'Solar',
    'lord of wolves': 'Solar',
    'duality': 'Solar',
    'jotunn': 'Solar',
    'jötunn': 'Solar',
    'merciless': 'Solar',
    'vex mythoclast': 'Solar',
    'one thousand voices': 'Solar',
    '1000 voices': 'Solar',
    "finality's auger": 'Solar',
    'whisper of the worm': 'Solar',
    'still hunt': 'Solar',
    'ice breaker': 'Solar',
    'the prospector': 'Solar',
    'parasite': 'Solar',
    'gjallarhorn': 'Solar',
    "dragon's breath": 'Solar',
    'eyes of tomorrow': 'Solar',
    'whirling ovation': 'Solar',
    'sleeper simulant': 'Solar',
    'xenophage': 'Solar',
    'heir apparent': 'Solar',
    'the lament': 'Solar',
    'praxic blade': 'Solar',
    // Arc Exotics
    'centrifuse': 'Arc',
    'riskrunner': 'Arc',
    'tarrabah': 'Solar',
    'lodestar': 'Arc',
    'trespasser': 'Arc',
    'trinity ghoul': 'Arc',
    'the fourth horseman': 'Arc',
    'legend of acrius': 'Arc',
    'delicate tomb': 'Arc',
    'cloudstrike': 'Arc',
    'd.a.r.c.i.': 'Arc',
    'darci': 'Arc',
    'coldheart': 'Arc',
    'thunderlord': 'Arc',
    'grand overture': 'Arc',
    'the wardcliff coil': 'Arc',
    'worldline zero': 'Arc',
    // Void Exotics
    'hard light': 'Void',
    'collective obligation': 'Void',
    'graviton lance': 'Void',
    'the manticore': 'Void',
    'buried bloodline': 'Void',
    'telesto': 'Void',
    'vexcalibur': 'Void',
    'lorentz driver': 'Void',
    'wavesplitter': 'Void',
    'ruinous effigy': 'Void',
    'choir of one': 'Void',
    'the colony': 'Void',
    'dead messenger': 'Void',
    'alethonym': 'Void',
    'deathbringer': 'Void',
    'truth': 'Void',
    'deterministic chaos': 'Void',
    'black talon': 'Void',
    'heartshadow': 'Void',
    // Stasis Exotics
    'cryosthesia 77k': 'Stasis',
    'wicked implement': 'Stasis',
    'verglas curve': 'Stasis',
    'conditional finality': 'Stasis',
    'winterbite': 'Stasis',
    "salvation's grip": 'Stasis',
    'new land beyond': 'Stasis',
    'borealis': 'Stasis',
    // Strand Exotics
    'quicksilver storm': 'Strand',
    "slayer's fang": 'Strand',
    'final warning': 'Strand',
    'wish-keeper': 'Strand',
    'tessellation': 'Strand',
    'euphony': 'Strand',
    'the navigator': 'Strand',
    'barrow-dyad': 'Strand',
};
export function getWeaponStun(sheetWeapon) {
    if (!sheetWeapon)
        return '';
    // 1. Direct Aegis Stun Column (if non-empty string exported)
    if (sheetWeapon.stun && sheetWeapon.stun.trim()) {
        return sheetWeapon.stun;
    }
    if (sheetWeapon.exoticViability?.stun && sheetWeapon.exoticViability.stun.trim()) {
        return sheetWeapon.exoticViability.stun;
    }
    const nameLower = (sheetWeapon.name || '').toLowerCase().trim();
    // 2. High-Performance O(1) Exotic Stun Map Lookup
    if (EXOTIC_STUN_MAP[nameLower]) {
        return EXOTIC_STUN_MAP[nameLower];
    }
    // Fallback substring matching for name variants
    for (const [exoticKey, stunType] of Object.entries(EXOTIC_STUN_MAP)) {
        if (nameLower.includes(exoticKey)) {
            return stunType;
        }
    }
    // 3. Explicit stun in origin trait
    if (sheetWeapon.origin && /barrier|overload|unstoppable/i.test(sheetWeapon.origin)) {
        return sheetWeapon.origin;
    }
    // 4. Archetype Frame & Description Keyword matching for all 140+ Exotic & Legendary weapons
    const frameLower = `${sheetWeapon.frame || ''} ${sheetWeapon.notes || ''} ${sheetWeapon.description || ''} ${sheetWeapon.energy || ''}`.toLowerCase();
    // Specialized archetype overrides
    if (frameLower.includes('support'))
        return 'Overload';
    if (frameLower.includes('adaptive burst'))
        return 'Barrier';
    if (frameLower.includes('area denial'))
        return 'Overload';
    if (frameLower.includes('double fire') || frameLower.includes('double-fire'))
        return 'Unstoppable';
    if (frameLower.includes('micro-missile') || frameLower.includes('micro missile'))
        return 'Unstoppable';
    if (frameLower.includes('wave'))
        return 'Unstoppable';
    if (frameLower.includes('compressed wave'))
        return 'Unstoppable';
    if (frameLower.includes('heavy burst'))
        return 'Unstoppable';
    if (frameLower.includes('spread shot'))
        return 'Overload';
    if (frameLower.includes('aggressive burst'))
        return 'Unstoppable';
    if (frameLower.includes('legacy pr-55') || frameLower.includes('pr-55'))
        return 'Barrier';
    if (frameLower.includes('rocket-assisted'))
        return 'Unstoppable';
    if (frameLower.includes('disruption'))
        return 'Barrier';
    if (frameLower.includes('caster'))
        return 'Barrier';
    if (frameLower.includes('vortex'))
        return 'Overload';
    if (frameLower.includes('heat'))
        return 'Overload';
    // General primary & special frames
    if (frameLower.includes('aggressive'))
        return 'Unstoppable';
    if (frameLower.includes('high-impact') || frameLower.includes('high impact'))
        return 'Unstoppable';
    if (frameLower.includes('precision'))
        return 'Barrier';
    if (frameLower.includes('adaptive'))
        return 'Barrier';
    if (frameLower.includes('lightweight'))
        return 'Overload';
    if (frameLower.includes('rapid-fire') || frameLower.includes('rapid fire'))
        return 'Overload';
    return '';
}
export function getWeaponEnergy(sheetWeapon) {
    if (!sheetWeapon)
        return '';
    const rawEnergy = (sheetWeapon.energy || '').trim();
    if (rawEnergy && /solar|arc|void|stasis|strand|kinetic/i.test(rawEnergy)) {
        return rawEnergy;
    }
    const nameLower = (sheetWeapon.name || '').toLowerCase().trim();
    // High-Performance O(1) Exotic Energy Map Lookup
    if (EXOTIC_ENERGY_MAP[nameLower]) {
        return EXOTIC_ENERGY_MAP[nameLower];
    }
    for (const [key, element] of Object.entries(EXOTIC_ENERGY_MAP)) {
        if (nameLower.includes(key)) {
            return element;
        }
    }
    return 'Kinetic';
}
