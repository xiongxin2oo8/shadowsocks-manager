const manager = appRequire('services/manager');
const serverManager = appRequire('plugins/flowSaver/server');
const knex = appRequire('init/knex').knex;

exports.getServers = (req, res) => {
  serverManager.list({
    status: !!req.query.status,
  }).then(success => {
    res.send(success);
  }).catch(err => {
    console.log(err);
    res.status(500).end();
  });
};

exports.getOneServer = (req, res) => {
  const serverId = req.params.serverId;
  const noPort = req.query.noPort;
  let result = null;
  knex('server').select().where({
    id: +serverId,
  }).then(success => {
    if (success.length) {
      result = success[0];
      if (noPort) { return; }
      return manager.send({
        command: 'portlist',
      }, {
        host: success[0].host,
        port: success[0].port,
        password: success[0].password
      });
    }
    res.status(404).end();
  }).then(success => {
    if (success) { result.ports = success; }
    res.send(result);
  }).catch(err => {
    console.log('line-39', err);
    res.status(500).end();
  });
};

exports.addServer = async (req, res) => {
  try {
    req.checkBody('type', 'Invalid type').notEmpty();
    req.checkBody('name', 'Invalid name').notEmpty();
    req.checkBody('address', 'Invalid address').notEmpty();
    req.checkBody('port', 'Invalid port').isInt({ min: 1, max: 65535 });
    req.checkBody('password', 'Invalid password').notEmpty();
    req.checkBody('method', 'Invalid method').notEmpty();
    req.checkBody('scale', 'Invalid scale').notEmpty();
    req.checkBody('shift', 'Invalid shift').isInt();
    req.checkBody('monthflow', 'Invalid monthflow').isInt({ min: 0 });
    req.checkBody('resetday', 'Invalid resetday').isInt({ min: 1, max: 31 });
    req.checkBody('singlePort', 'Invalid singlePort').notEmpty();
    req.checkBody('v2ray', 'Invalid v2ray').isInt();
    req.checkBody('v2rayMethod', 'Invalid v2rayMethod').notEmpty();
    req.checkBody('v2rayPort', 'Invalid v2rayPort').isInt({ min: 1, max: 65535 });
    req.checkBody('singleMode', 'Invalid singleMode').isInt();
    const result = await req.getValidationResult();
    if (!result.isEmpty()) { return Promise.reject(result.array()); }
    const type = req.body.type;
    const isWG = type === 'WireGuard';
    const name = req.body.name;
    const comment = req.body.comment;
    const address = req.body.address;
    const port = +req.body.port;
    const password = req.body.password;
    const method = req.body.method;
    const scale = req.body.scale;
    const shift = req.body.shift;
    const monthflow = req.body.monthflow;
    const resetday = req.body.resetday;
    const key = isWG ? req.body.key : null;
    const net = isWG ? req.body.net : null;
    const wgPort = isWG ? req.body.wgPort : null;
    const singlePort = req.body.singlePort;
    const v2ray = +req.body.v2ray;
    const v2rayMethod = req.body.v2rayMethod;
    const v2rayPort = +req.body.v2rayPort;
    const singleMode = req.body.singleMode;
    await manager.send({
      command: 'flow',
      options: { clear: false, },
    }, {
      host: address,
      port,
      password,
    });
    await serverManager.add({
      type,
      name,
      host: address,
      port,
      password,
      method,
      scale,
      comment,
      shift,
      monthflow,
      resetday,
      key,
      net,
      wgPort,
      singlePort,
      v2ray,
      v2rayMethod,
      v2rayPort,
      singleMode
    });
    res.send('success');
  } catch (err) {
    console.log(err);
    res.status(403).end();
  }
};

exports.editServer = async (req, res) => {
  try {
    req.checkBody('type', 'Invalid type').notEmpty();
    req.checkBody('name', 'Invalid name').notEmpty();
    req.checkBody('address', 'Invalid address').notEmpty();
    req.checkBody('port', 'Invalid port').isInt({ min: 1, max: 65535 });
    req.checkBody('password', 'Invalid password').notEmpty();
    req.checkBody('method', 'Invalid method').notEmpty();
    req.checkBody('scale', 'Invalid scale').notEmpty();
    req.checkBody('shift', 'Invalid shift').isInt();
    req.checkBody('monthflow', 'Invalid monthflow').isInt({ min: 0 });
    req.checkBody('resetday', 'Invalid resetday').isInt({ min: 1, max: 31 });
    req.checkBody('singlePort', 'Invalid singlePort').notEmpty();
    req.checkBody('v2ray', 'Invalid v2ray').isInt();
    req.checkBody('v2rayMethod', 'Invalid v2rayMethod').notEmpty();
    req.checkBody('v2rayPort', 'Invalid v2rayPort').isInt({ min: 1, max: 65535 });
    req.checkBody('singleMode', 'Invalid singleMode').notEmpty();
    const result = await req.getValidationResult();
    if (!result.isEmpty()) { return Promise.reject(result.array()); }
    const serverId = req.params.serverId;
    const type = req.body.type;
    const isWG = type === 'WireGuard';
    const name = req.body.name;
    const comment = req.body.comment;
    const address = req.body.address;
    const port = +req.body.port;
    const password = req.body.password;
    const method = req.body.method;
    const scale = req.body.scale;
    const shift = req.body.shift;
    const monthflow = req.body.monthflow;
    const resetday = req.body.resetday;
    const key = isWG ? req.body.key : null;
    const net = isWG ? req.body.net : null;
    const wgPort = isWG ? req.body.wgPort : null;
    const singlePort = req.body.singlePort;
    const v2ray = +req.body.v2ray;
    const v2rayMethod = req.body.v2rayMethod;
    const v2rayPort = +req.body.v2rayPort;
    const singleMode = req.body.singleMode;
    const check = +req.body.check;
    await manager.send({
      command: 'flow',
      options: { clear: false, },
    }, {
      host: address,
      port,
      password,
    });
    await serverManager.edit({
      id: serverId,
      type,
      name,
      host: address,
      port,
      password,
      method,
      scale,
      comment,
      shift,
      monthflow,
      resetday,
      key,
      net,
      wgPort,
      singlePort,
      v2ray,
      v2rayMethod,
      v2rayPort,
      singleMode,
      check
    });
    res.send('success');
  } catch (err) {
    console.log(err);
    res.status(403).end();
  }
};

exports.deleteServer = (req, res) => {
  const serverId = req.params.serverId;
  serverManager.del(serverId)
    .then(success => {
      res.send('success');
    }).catch(err => {
      console.log(err);
      res.status(403).end();
    });
};
