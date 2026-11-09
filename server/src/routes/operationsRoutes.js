const express = require('express');
const { authenticateToken } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/authorization');
const operations = require('../controllers/operationsController');

const router = express.Router();
const ownerOnly = [authenticateToken, authorizeRoles('owner')];
const kitchenAccess = [authenticateToken, authorizeRoles('owner', 'kitchen')];
const posAccess = [authenticateToken, authorizeRoles('owner', 'pos')];
const courierAccess = [authenticateToken, authorizeRoles('owner', 'courier')];

router.get('/owner/dashboard', ...ownerOnly, operations.dashboard);
router.get('/owner/audit-logs', ...ownerOnly, operations.listAuditLogs);
router.get('/owner/partners', ...ownerOnly, operations.listPartners);
router.post('/owner/partners', ...ownerOnly, operations.createPartner);
router.patch('/owner/partners/:partnerId', ...ownerOnly, operations.updatePartner);
router.get('/owner/partners/:partnerId/inventory', ...ownerOnly, operations.getPartnerInventory);
router.get('/owner/partners/:partnerId/sales', ...ownerOnly, operations.listPartnerSales);
router.get('/owner/partners/:partnerId/settlement', ...ownerOnly, operations.getPartnerSettlement);
router.get('/owner/settlements', ...ownerOnly, operations.listSettlements);
router.get('/owner/prices', ...ownerOnly, operations.getPrices);
router.patch('/owner/prices', ...ownerOnly, operations.updatePrices);
router.get('/owner/assets', ...ownerOnly, operations.listAssets);
router.post('/owner/assets', ...ownerOnly, operations.createAsset);
router.patch('/owner/assets/:assetId', ...ownerOnly, operations.updateAsset);
router.post('/owner/assets/:assetId/approve-writeoff', ...ownerOnly, operations.approveAssetWriteoff);
router.get('/owner/users', ...ownerOnly, operations.listUsers);
router.post('/owner/users', ...ownerOnly, operations.createUser);
router.patch('/owner/users/:email', ...ownerOnly, operations.updateUser);
router.get('/owner/orders', ...ownerOnly, operations.listOrders);
router.patch('/owner/orders/:orderId/review', ...ownerOnly, operations.reviewOrder);
router.get('/owner/claims', ...ownerOnly, operations.listClaims);
router.patch('/owner/claims/:claimId/review', ...ownerOnly, operations.reviewClaim);
router.get('/owner/settlements/:partnerId', ...ownerOnly, operations.getPartnerSettlement);
router.post('/owner/manifests', ...ownerOnly, operations.createManualManifest);
router.get('/owner/manifests', ...ownerOnly, operations.listManifests);
router.post('/owner/manifests/:manifestId/cancel', ...ownerOnly, operations.cancelManifest);

router.get('/kitchen/ingredients', ...kitchenAccess, operations.listIngredients);
router.post('/kitchen/ingredients', ...kitchenAccess, operations.createIngredient);
router.patch('/kitchen/ingredients/:ingredientId', ...kitchenAccess, operations.updateIngredient);
router.get('/kitchen/recipe', ...kitchenAccess, operations.getRecipe);
router.put('/kitchen/recipe', ...ownerOnly, operations.updateRecipe);
router.get('/kitchen/batches', ...kitchenAccess, operations.listBatches);
router.get('/kitchen/movements', ...kitchenAccess, operations.listInventoryMovements);
router.get('/kitchen/purchase-orders', ...kitchenAccess, operations.listPurchaseOrders);
router.post('/kitchen/purchase-orders', ...kitchenAccess, operations.createPurchaseOrder);
router.post('/kitchen/purchase-orders/:orderId/receive', ...kitchenAccess, operations.receivePurchaseOrder);
router.get('/kitchen/production', ...kitchenAccess, operations.listProductions);
router.post('/kitchen/production', ...kitchenAccess, operations.createProduction);
router.post('/kitchen/adjustments', ...kitchenAccess, operations.createIngredientAdjustment);

router.get('/pos/products', ...posAccess, operations.getPosProducts);
router.get('/pos/shifts/current', ...posAccess, operations.getCurrentShift);
router.post('/pos/shifts/open', ...posAccess, operations.openShift);
router.post('/pos/shifts/close', ...posAccess, operations.closeShift);
router.get('/pos/shifts/:shiftId/sales', ...posAccess, operations.listShiftSales);
router.post('/pos/sales', ...posAccess, operations.checkout);
router.post('/pos/spoilage', ...posAccess, operations.reportSpoilage);

router.get('/logistics/manifests', ...courierAccess, operations.listManifests);
router.post('/logistics/manifests/:manifestId/claim', authenticateToken, authorizeRoles('courier'), operations.claimManifest);
router.post('/logistics/manifests/:manifestId/deliver', ...courierAccess, operations.confirmDelivery);

router.get('/partner/inventory', authenticateToken, authorizeRoles('partner'), operations.getPartnerInventory);
router.post('/partner/sales', authenticateToken, authorizeRoles('partner'), operations.createPartnerSale);
router.get('/partner/sales', authenticateToken, authorizeRoles('partner'), operations.listPartnerSales);
router.post('/partner/orders', authenticateToken, authorizeRoles('partner'), operations.createOrder);
router.get('/partner/orders', authenticateToken, authorizeRoles('partner'), operations.listOrders);
router.post('/partner/claims', authenticateToken, authorizeRoles('partner'), operations.createClaim);
router.get('/partner/claims', authenticateToken, authorizeRoles('partner'), operations.listClaims);
router.get('/partner/settlement', authenticateToken, authorizeRoles('partner'), operations.getPartnerSettlement);

module.exports = router;
