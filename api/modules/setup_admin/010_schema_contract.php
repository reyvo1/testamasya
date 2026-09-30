<?php
declare(strict_types=1);
/**
 * TAMASYA V137 fresh schema contract helpers.
 *
 * Production runtime is intentionally read-only with respect to database schema.
 * database_setup.sql is the single canonical source for core tables/columns.
 */
if (!defined('TAMASYA_API_ENTRY')) { http_response_code(404); exit; }

function tamasyaSchemaExistingTables(PDO $pdo, array $tables): array {
    $tables=array_values(array_unique(array_filter(array_map(static fn($v)=>trim((string)$v),$tables),static fn($v)=>$v!=='')));
    if(!$tables)return [];
    $placeholders=implode(',',array_fill(0,count($tables),'?'));
    $stmt=$pdo->prepare("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ({$placeholders})");
    $stmt->execute($tables);
    return array_values(array_unique(array_map('strval',$stmt->fetchAll(PDO::FETCH_COLUMN)?:[])));
}

function tamasyaSchemaMissingTables(PDO $pdo, array $tables): array {
    $tables=array_values(array_unique(array_filter(array_map(static fn($v)=>trim((string)$v),$tables),static fn($v)=>$v!=='')));
    if(!$tables)return [];
    $present=array_fill_keys(tamasyaSchemaExistingTables($pdo,$tables),true);
    return array_values(array_filter($tables,static fn($table)=>!isset($present[$table])));
}

/**
 * Bulk critical-column readiness check. Input shape:
 * ['table_name'=>['column_a','column_b']]. Returns ['table.column', ...].
 * Runtime uses this only for release-critical successor columns; the unified
 * configurator remains the exhaustive canonical schema verifier.
 */
function tamasyaSchemaMissingColumns(PDO $pdo, array $requirements): array {
    $normalized=[];
    foreach($requirements as $table=>$columns){
        $table=trim((string)$table);if($table==='')continue;
        foreach((array)$columns as $column){$column=trim((string)$column);if($column!=='')$normalized[$table][$column]=true;}
    }
    if(!$normalized)return [];
    $tables=array_keys($normalized);$placeholders=implode(',',array_fill(0,count($tables),'?'));
    $stmt=$pdo->prepare("SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ({$placeholders})");
    $stmt->execute($tables);$present=[];
    foreach($stmt->fetchAll(PDO::FETCH_ASSOC)?:[] as $row){$present[(string)$row['TABLE_NAME']][(string)$row['COLUMN_NAME']]=true;}
    $missing=[];
    foreach($normalized as $table=>$columns)foreach(array_keys($columns) as $column)if(empty($present[$table][$column]))$missing[]=$table.'.'.$column;
    return $missing;
}

function tamasyaSchemaExistingTriggers(PDO $pdo, array $triggers): array {
    $triggers=array_values(array_unique(array_filter(array_map(static fn($v)=>trim((string)$v),$triggers),static fn($v)=>$v!=='')));
    if(!$triggers)return [];
    $placeholders=implode(',',array_fill(0,count($triggers),'?'));
    $stmt=$pdo->prepare("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME IN ({$placeholders})");
    $stmt->execute($triggers);
    return array_values(array_unique(array_map('strval',$stmt->fetchAll(PDO::FETCH_COLUMN)?:[])));
}

function tamasyaSchemaTableExists(PDO $pdo, string $table): bool {
    $stmt = $pdo->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? LIMIT 1');
    $stmt->execute([$table]);
    return (bool)$stmt->fetchColumn();
}

function tamasyaSchemaColumnMeta(PDO $pdo, string $table, string $column): ?array {
    $stmt = $pdo->prepare('SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1');
    $stmt->execute([$table, $column]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return is_array($row) ? $row : null;
}

/**
 * Normalize information_schema.COLUMNS.COLUMN_DEFAULT across MySQL/MariaDB.
 * MariaDB may expose string defaults as quoted SQL literals (for example
 * `'reserved'`) while other server/client combinations expose `reserved`.
 * Runtime release gates compare semantic defaults, not transport formatting.
 */
function tamasyaSchemaNormalizeColumnDefault(mixed $value): ?string {
    if ($value === null) return null;
    $normalized = trim((string)$value);
    $length = strlen($normalized);
    if ($length >= 2) {
        $first = $normalized[0];
        $last = $normalized[$length - 1];
        if (($first === "'" && $last === "'") || ($first === '"' && $last === '"')) {
            $normalized = substr($normalized, 1, -1);
            if ($first === "'") $normalized = str_replace("''", "'", $normalized);
            else $normalized = str_replace('""', '"', $normalized);
        }
    }
    return $normalized;
}

function tamasyaSchemaMigrationApplied(PDO $pdo, string $version): bool {
    if (!tamasyaSchemaTableExists($pdo, 'schema_migrations')) return false;
    $stmt = $pdo->prepare('SELECT 1 FROM schema_migrations WHERE version=? LIMIT 1');
    $stmt->execute([$version]);
    return (bool)$stmt->fetchColumn();
}

// Compatibility names retained only for business/runtime helpers. They are
// read-only and do not expose any ALTER/CREATE behavior.
function tamasyaTableExists(PDO $pdo, string $table): bool {
    return tamasyaSchemaTableExists($pdo, $table);
}

function tamasyaColumnMeta(PDO $pdo, string $table, string $column): ?array {
    return tamasyaSchemaColumnMeta($pdo, $table, $column);
}

function schemaMigrationApplied(PDO $pdo, string $version): bool {
    return tamasyaSchemaMigrationApplied($pdo, $version);
}
