# Order Status / Order History Flow

## Customer flow

1. Checkout writes the order to both:
   - `users/{uid}/orders/{orderId}`
   - `restaurants/chicken-gray-snacks/orders/{orderId}`
2. New orders start with `status: "new"`.
3. The customer dashboard listens to `users/{uid}/orders` in real time.
4. The Order status panel shows active orders while the status is:
   - `new`
   - `accepted`
   - `preparing`
   - `out_for_delivery`
5. The restaurant owner updates the restaurant order in the Owner Console.
6. The Owner Console mirrors the same status fields to the customer's order document in one Firestore batch.
7. The customer UI immediately receives the update through the Firestore snapshot listener.
8. When status becomes `delivered`, the order disappears from Order status and appears in Order history.

## Status fields

- `status`
- `accepted`
- `delivered`
- `statusUpdatedAt`
- `acceptedAt`
- `preparingAt`
- `outForDeliveryAt`
- `deliveredAt`
- `updatedAt`

## Firebase rules

The `firestore.rules` file in this project is shared by the customer and server projects. Deploy it to the `chicken-gray-snacks` Firebase project after updating the code.

```bash
firebase use chicken-gray-snacks
firebase deploy --only firestore:rules
```

The server-side update is restricted to workflow-status fields. The owner must be registered in `hotelOwners` with `restaurantId: "chicken-gray-snacks"`.
