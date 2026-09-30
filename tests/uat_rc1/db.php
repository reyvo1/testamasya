<?php
declare(strict_types=1);
$root=dirname(__DIR__,2);
require_once $root.'/database_bootstrap.php';
$raw=stream_get_contents(STDIN);
$input=json_decode($raw?:'{}',true);
if(!is_array($input)||!isset($input['sql'])){fwrite(STDERR,"Invalid input\n");exit(2);}
$config=tamasyaResolveDatabaseConfig($root);
[$pdo,$error,$stage]=tamasyaConnectDatabase($config);
if(!$pdo instanceof PDO){fwrite(STDERR,"DB connect failed [$stage]: $error\n");exit(3);}
try{
    $stmt=$pdo->prepare((string)$input['sql']);
    $stmt->execute(is_array($input['params']??null)?$input['params']:[]);
    if($stmt->columnCount()>0){echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC),JSON_UNESCAPED_SLASHES);}
    else{echo json_encode([],JSON_UNESCAPED_SLASHES);}
}catch(Throwable $e){fwrite(STDERR,$e->getMessage()."\n");exit(4);}
