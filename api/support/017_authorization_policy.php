<?php
/**
 * TAMASYA V137 canonical authorization policy.
 *
 * FINAL11 root hardening separates role/capability/desktop-tab decisions from
 * the legacy identity/audit support. Route modules continue using compatibility
 * function names, but all authorization interpretation now lives here.
 */
if (!defined('TAMASYA_API_ENTRY')) { http_response_code(404); exit; }

/** Source line 2039: requireRoles */
function requireRoles($user, $roles) {
    if (!$user || !in_array($user['role'] ?? '', $roles, true)) {
        http_response_code(403);
        echo json_encode(["success" => false, "error" => "Forbidden: Anda tidak memiliki izin untuk operasi ini."]);
        exit;
    }
}

/** Source line 2047: hasCapability */
function tamasyaPermissionOverride($permissions, string $group, string $key): ?bool {
    if($permissions===null || $permissions==='')return null;
    if(is_string($permissions))$permissions=json_decode($permissions,true);
    // Corrupt or unexpected permission shapes must deny, never grant via a role fallback.
    if(!is_array($permissions))return false;
    if(!array_key_exists($group,$permissions))return null;
    if(!is_array($permissions[$group]))return false;
    if(!array_key_exists($key,$permissions[$group]))return null;
    $value=$permissions[$group][$key];
    if(is_bool($value))return $value;
    if($value===1 || $value==='1')return true;
    if(is_string($value) && strtolower(trim($value))==='true')return true;
    return false;
}

function hasCapability($user, $capability, $fallbackRoles = []) {
    if (!$user) return false;
    $override=tamasyaPermissionOverride($user['permissions']??null,'capabilities',(string)$capability);
    if($override!==null)return $override;
    return in_array($user['role'] ?? '', $fallbackRoles, true);
}

/** Source line 2057: requireCapability */
function requireCapability($user, $capability, $fallbackRoles = []) {
    if (!hasCapability($user, $capability, $fallbackRoles)) {
        http_response_code(403);
        echo json_encode(['success'=>false,'error'=>'Forbidden: izin '.$capability.' diperlukan.']);
        exit;
    }
}


/** Source line 2191: hasDesktopTabAccess */
function hasDesktopTabAccess($user, $tab, $fallbackRoles = []) {
    if (!$user) return false;
    $override=tamasyaPermissionOverride($user['permissions']??null,'desktopTabs',(string)$tab);
    if($override!==null)return $override;
    return in_array($user['role'] ?? '', $fallbackRoles, true);
}

/** Source line 2201: requireDesktopTabAccess */
function requireDesktopTabAccess($user, $tab, $fallbackRoles = []) {
    if (!hasDesktopTabAccess($user, $tab, $fallbackRoles)) {
        http_response_code(403);
        echo json_encode(['success'=>false,'error'=>'Forbidden: akses menu '.$tab.' diperlukan.']);
        exit;
    }
}
