<?php
declare(strict_types=1);
/** Shared optional TLS policy for hotel and HQ database connections. */
function tamasyaDatabaseTlsOptions(array $override=[]): array {
    $raw=$override['required']??getenv('DB_TLS_REQUIRED');
    $required=$raw===false?false:filter_var($raw,FILTER_VALIDATE_BOOLEAN,FILTER_NULL_ON_FAILURE);
    if($required===null)throw new RuntimeException('DB_TLS_REQUIRED must be a boolean.');
    $ca=(string)($override['caFile']??(getenv('DB_SSL_CA')?:''));
    if(!$required&&$ca==='')return [];
    $path=realpath($ca);
    if(!$path||!is_file($path)||!is_readable($path)||!defined('PDO::MYSQL_ATTR_SSL_CA')||!defined('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT'))throw new RuntimeException('Verified MySQL TLS requires a readable CA file and driver support.');
    return [PDO::MYSQL_ATTR_SSL_CA=>$path,PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT=>true];
}
function tamasyaAssertDatabaseTls(PDO $pdo,array $options): void {
    if(!$options)return;
    $row=$pdo->query("SHOW SESSION STATUS LIKE 'Ssl_cipher'")->fetch(PDO::FETCH_NUM);
    if(!$row||trim((string)($row[1]??''))==='')throw new RuntimeException('Database connection did not negotiate required TLS.');
}
