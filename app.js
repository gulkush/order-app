import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db, ensureAnonymousAuth } from "./firebase.js";

const ordersRef = collection(db, "orders");

const toInputDate = (value) => {
  if (!value) return "";
  const date = value.toDate ? value.toDate() : new Date(value);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const fromInputDate = (value) => {
  if (!value) return null;
  const [yyyy, mm, dd] = value.split("-");
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
};

const toNumber = (value) => (value === "" || value === null ? 0 : Number(value));

window.orderApp = function orderApp() {
  return {
    loading: true,
    orders: [],
    showOrderForm: false,
    showDispatchForm: false,
    showPaymentForm: false,
    filterStatus: "all",
    pageSize: 20,
    currentPage: 1,
    sortKey: "orderDate",
    sortDir: "desc",
    orderFormMode: "create",
    activeOrderId: null,
    orderForm: {
      orderDate: toInputDate(new Date()),
      partyName: "",
      orderDetails: "",
      orderQuantity: 0,
      rate: 0,
    },
    dispatchForm: {
      dispatchNumber: "",
      dispatchDate: "",
      dispatchDetails: "",
      dispatchQuantity: 0,
      tax: 0,
    },
    paymentForm: {
      paymentDate: "",
      receivedBy: "",
      toAccount: "",
      paymentDetails: "",
      amountReceived: 0,
    },

    async init() {
      try {
        await ensureAnonymousAuth();
        await this.loadOrders();
      } catch (err) {
        console.error("Auth error", err);
      }
    },

    async loadOrders(skipSanitize = false) {
      this.loading = true;
      const snapshot = await getDocs(ordersRef);
      const list = [];
      const sanitizeUpdates = [];
      snapshot.forEach((snap) => {
        const data = snap.data();
        if (!skipSanitize) {
          const updatePayload = {};
          const hasDispatchDate = !!data.dispatchDate;
          if (!hasDispatchDate && data.status !== "order") {
            updatePayload.status = "order";
          }
          if (data.orderQuantity === undefined && data.orderWeight !== undefined) {
            updatePayload.orderQuantity = data.orderWeight;
          }
          if (data.dispatchQuantity === undefined && data.dispatchWeight !== undefined) {
            updatePayload.dispatchQuantity = data.dispatchWeight;
          }
          if (Object.keys(updatePayload).length > 0) {
            updatePayload.updatedAt = serverTimestamp();
            const ref = doc(db, "orders", snap.id);
            sanitizeUpdates.push(updateDoc(ref, updatePayload));
          }
        }
        list.push({ id: snap.id, ...data });
      });
      if (!skipSanitize && sanitizeUpdates.length > 0) {
        await Promise.all(sanitizeUpdates);
        await this.loadOrders(true);
        return;
      }
      this.orders = list.sort((a, b) => {
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bTime - aTime;
      });
      this.loading = false;
    },

    setFilter(status) {
      this.filterStatus = status;
      this.currentPage = 1;
    },

    filteredOrders() {
      let list = this.orders;
      if (this.filterStatus === "paid") {
        list = list.filter((order) => this.isFullyPaid(order));
      } else if (this.filterStatus === "dispatched") {
        list = list.filter(
          (order) =>
            (order.status === "dispatched" || order.status === "paid") &&
            !this.isFullyPaid(order)
        );
      } else if (this.filterStatus !== "all") {
        list = list.filter((order) => order.status === this.filterStatus);
      }

      return [...list].sort((a, b) => this.compareForSort(a, b));
    },

    paginatedOrders() {
      const filtered = this.filteredOrders();
      const start = (this.currentPage - 1) * this.pageSize;
      return filtered.slice(start, start + this.pageSize);
    },

    pageCount() {
      return Math.max(1, Math.ceil(this.filteredOrders().length / this.pageSize));
    },

    pages() {
      const count = this.pageCount();
      return Array.from({ length: count }, (_, i) => i + 1);
    },

    goToPage(page) {
      const count = this.pageCount();
      if (page < 1 || page > count) return;
      this.currentPage = page;
    },

    toggleSort(key) {
      if (this.sortKey === key) {
        this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
      } else {
        this.sortKey = key;
        this.sortDir = "asc";
      }
      this.currentPage = 1;
    },

    sortIndicator(key) {
      if (this.sortKey !== key) return "";
      return this.sortDir === "asc" ? "▲" : "▼";
    },

    compareForSort(a, b) {
      const dir = this.sortDir === "asc" ? 1 : -1;
      const key = this.sortKey;

      if (key === "partyName") {
        const aVal = (a.partyName || "").toLowerCase();
        const bVal = (b.partyName || "").toLowerCase();
        return aVal.localeCompare(bVal) * dir;
      }

      if (key === "orderDate" || key === "dispatchDate") {
        const aDate = a[key]?.toDate ? a[key].toDate() : a[key] ? new Date(a[key]) : null;
        const bDate = b[key]?.toDate ? b[key].toDate() : b[key] ? new Date(b[key]) : null;
        const aTime = aDate ? aDate.getTime() : 0;
        const bTime = bDate ? bDate.getTime() : 0;
        return (aTime - bTime) * dir;
      }

      return 0;
    },

    toJsDate(value) {
      if (!value) return null;
      return value.toDate ? value.toDate() : new Date(value);
    },

    isOlderThanDays(value, days) {
      const date = this.toJsDate(value);
      if (!date) return false;
      const ms = days * 24 * 60 * 60 * 1000;
      return Date.now() - date.getTime() > ms;
    },

    sortList(list) {
      return [...list].sort((a, b) => this.compareForSort(a, b));
    },

    paidRecentOrders() {
      const list = this.orders.filter((order) => this.isFullyPaid(order));
      const recent = list.filter((order) => !this.isOlderThanDays(order.paymentDate, 30));
      return this.sortList(recent);
    },

    paidOldOrders() {
      const list = this.orders.filter((order) => this.isFullyPaid(order));
      const old = list.filter((order) => this.isOlderThanDays(order.paymentDate, 30));
      return this.sortList(old);
    },

    pendingOrderQuantitySum() {
      const list = this.orders.filter((order) => order.status === "order");
      return list.reduce((sum, order) => sum + toNumber(order.orderQuantity), 0);
    },

    dispatchedBaseList() {
      return this.orders.filter(
        (order) =>
          (order.status === "dispatched" || order.status === "paid") &&
          !this.isFullyPaid(order)
      );
    },

    dispatchedRecentOrders() {
      const list = this.dispatchedBaseList();
      const recent = list.filter((order) => !this.isOlderThanDays(order.dispatchDate, 7));
      return this.sortList(recent);
    },

    dispatchedOld7Orders() {
      const list = this.dispatchedBaseList();
      const old7 = list.filter(
        (order) =>
          this.isOlderThanDays(order.dispatchDate, 7) &&
          !this.isOlderThanDays(order.dispatchDate, 30)
      );
      return this.sortList(old7);
    },

    dispatchedOld30Orders() {
      const list = this.dispatchedBaseList();
      const old30 = list.filter((order) => this.isOlderThanDays(order.dispatchDate, 30));
      return this.sortList(old30);
    },

    async deleteOlderPaid() {
      const oldOrders = this.paidOldOrders();
      if (oldOrders.length === 0) return;
      const confirmDelete = window.confirm(
        `Delete ${oldOrders.length} paid records older than 30 days? This cannot be undone.`
      );
      if (!confirmDelete) return;
      await Promise.all(
        oldOrders.map((order) => deleteDoc(doc(db, "orders", order.id)))
      );
      await this.loadOrders();
    },

    rowClass(order) {
      if (order && this.isFullyPaid(order)) return "bg-green-100";
      if (order.status === "order") return "bg-blue-100";

      const dispatchDate = order.dispatchDate;
      if (this.isOlderThanDays(dispatchDate, 30)) return "bg-red-100";
      if (this.isOlderThanDays(dispatchDate, 7)) return "bg-orange-100";
      return "bg-yellow-100";
    },

    isFullyPaid(order) {
      const received = toNumber(order.amountReceived);
      const amount = toNumber(order.dispatchAmount);
      const epsilon = 0.01;
      return amount > 0 && Math.abs(received - amount) <= epsilon;
    },

    formatDate(value) {
      if (!value) return "-";
      const date = value.toDate ? value.toDate() : new Date(value);
      return date.toLocaleDateString();
    },

    dispatchSummary(order) {
      if (!order.dispatchDate) return "Add Dispatch";
      return this.formatDate(order.dispatchDate);
    },

    paymentSummary(order) {
      const received = order.amountReceived ?? "";
      const amount = order.dispatchAmount ?? "";
      return `${received} | ${amount}`;
    },

    resetOrderForm() {
      this.orderForm = {
        orderDate: toInputDate(new Date()),
        partyName: "",
        orderDetails: "",
        orderQuantity: 0,
        rate: 0,
      };
    },

    openNewOrder() {
      this.orderFormMode = "create";
      this.activeOrderId = null;
      this.resetOrderForm();
      this.showOrderForm = true;
    },

    openEditOrder(order) {
      this.orderFormMode = "edit";
      this.activeOrderId = order.id;
      this.orderForm = {
        orderDate: toInputDate(order.orderDate),
        partyName: order.partyName || "",
        orderDetails: order.orderDetails || "",
        orderQuantity: order.orderQuantity ?? order.orderWeight ?? 0,
        rate: order.rate || 0,
      };
      this.showOrderForm = true;
    },

    closeOrderForm() {
      this.showOrderForm = false;
    },

    valueIsZeroOrNull(value) {
      if (value === null || value === undefined || value === "") return true;
      const num = Number(value);
      return Number.isFinite(num) && num === 0;
    },

    canDeleteOrderFromEdit() {
      if (this.orderFormMode !== "edit" || !this.activeOrderId) return false;
      return (
        this.valueIsZeroOrNull(this.orderForm.orderQuantity) &&
        this.valueIsZeroOrNull(this.orderForm.rate)
      );
    },

    async deleteOrderFromEdit() {
      if (!this.activeOrderId) return;
      if (!this.canDeleteOrderFromEdit()) {
        window.alert("Delete is allowed only when both Order Quantity and Rate are 0 or empty.");
        return;
      }
      const confirmDelete = window.confirm("Delete this order? This cannot be undone.");
      if (!confirmDelete) return;

      await deleteDoc(doc(db, "orders", this.activeOrderId));
      this.showOrderForm = false;
      this.activeOrderId = null;
      await this.loadOrders();
    },

    async saveOrder() {
      const payload = {
        orderDate: fromInputDate(this.orderForm.orderDate),
        partyName: this.orderForm.partyName.trim(),
        orderDetails: this.orderForm.orderDetails.trim(),
        orderQuantity: toNumber(this.orderForm.orderQuantity),
        rate: toNumber(this.orderForm.rate),
        updatedAt: serverTimestamp(),
      };

      if (this.orderFormMode === "create") {
        await addDoc(ordersRef, {
          ...payload,
          status: "order",
          createdAt: serverTimestamp(),
        });
      } else if (this.activeOrderId) {
        const ref = doc(db, "orders", this.activeOrderId);
        await updateDoc(ref, payload);
      }

      this.showOrderForm = false;
      await this.loadOrders();
    },

    openDispatch(order) {
      this.activeOrderId = order.id;
      this.dispatchForm = {
        dispatchNumber: order.dispatchNumber || "",
        dispatchDate: toInputDate(order.dispatchDate),
        dispatchDetails: order.dispatchDetails || "",
        dispatchQuantity: order.dispatchQuantity ?? order.dispatchWeight ?? 0,
        tax: order.tax || 0,
      };
      this.showDispatchForm = true;
    },

    closeDispatchForm() {
      this.showDispatchForm = false;
    },

    calcDispatchAmount() {
      const weight = toNumber(this.dispatchForm.dispatchQuantity);
      const order = this.orders.find((o) => o.id === this.activeOrderId);
      const rate = order ? toNumber(order.rate) : 0;
      const tax = toNumber(this.dispatchForm.tax);
      return (weight * rate + tax).toFixed(2);
    },

    activeRate() {
      const order = this.orders.find((o) => o.id === this.activeOrderId);
      return order ? toNumber(order.rate) : 0;
    },

    async saveDispatch() {
      if (!this.activeOrderId) return;
      const order = this.orders.find((o) => o.id === this.activeOrderId);
      const rate = order ? toNumber(order.rate) : 0;
      const dispatchQuantity = toNumber(this.dispatchForm.dispatchQuantity);
      const tax = toNumber(this.dispatchForm.tax);

      const payload = {
        dispatchNumber: this.dispatchForm.dispatchNumber.trim(),
        dispatchDate: fromInputDate(this.dispatchForm.dispatchDate),
        dispatchDetails: this.dispatchForm.dispatchDetails.trim(),
        dispatchQuantity,
        tax,
        dispatchAmount: dispatchQuantity * rate + tax,
        status: "dispatched",
        updatedAt: serverTimestamp(),
      };

      const ref = doc(db, "orders", this.activeOrderId);
      await updateDoc(ref, payload);
      this.showDispatchForm = false;
      await this.loadOrders();
    },

    openPayment(order) {
      this.activeOrderId = order.id;
      this.paymentForm = {
        paymentDate: toInputDate(order.paymentDate),
        receivedBy: order.receivedBy || "",
        toAccount: order.toAccount || "",
        paymentDetails: order.paymentDetails || "",
        amountReceived: order.amountReceived || 0,
      };
      this.showPaymentForm = true;
    },

    closePaymentForm() {
      this.showPaymentForm = false;
    },

    async savePayment() {
      if (!this.activeOrderId) return;
      const payload = {
        paymentDate: fromInputDate(this.paymentForm.paymentDate),
        receivedBy: this.paymentForm.receivedBy.trim(),
        toAccount: this.paymentForm.toAccount.trim(),
        paymentDetails: this.paymentForm.paymentDetails.trim(),
        amountReceived: toNumber(this.paymentForm.amountReceived),
        status: "paid",
        updatedAt: serverTimestamp(),
      };

      const ref = doc(db, "orders", this.activeOrderId);
      await updateDoc(ref, payload);
      this.showPaymentForm = false;
      await this.loadOrders();
    },
  };
};
