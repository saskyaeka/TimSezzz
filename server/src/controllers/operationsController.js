module.exports = Object.assign(
  {},
  require('./operations/ownerController'),
  require('./operations/kitchenController'),
  require('./operations/posController'),
  require('./operations/logisticsController'),
  require('./operations/partnerController'),
  require('./operations/reportsController')
);
