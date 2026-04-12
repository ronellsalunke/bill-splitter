import { useReducer, type KeyboardEvent } from "react";
import { calculateSplit, uploadReceipt } from "../services/billService";
import type {
  Bill,
  BillDraft,
  BillItem,
  BillItemField,
  BillItemFieldValue,
  OCRResponse,
  PaymentPlan,
} from "../types";

interface BillSplitterState {
  bills: Bill[];
  draft: BillDraft;
  paymentPlans: PaymentPlan[];
  showModal: boolean;
  showResults: boolean;
  isUploading: boolean;
}

type BillSplitterAction =
  | { type: "OPEN_NEW_BILL" }
  | { type: "OPEN_EDIT_BILL"; payload: Bill }
  | { type: "CLOSE_MODAL" }
  | { type: "DELETE_BILL"; payload: { id: string } }
  | { type: "SET_DRAFT_FIELD"; payload: { field: keyof Omit<BillDraft, "editingBillId" | "items">; value: string } }
  | { type: "ADD_ITEM" }
  | { type: "DELETE_ITEM"; payload: { index: number } }
  | { type: "UPDATE_ITEM"; payload: { index: number; field: BillItemField; value: BillItemFieldValue } }
  | { type: "ADD_CONSUMER"; payload: { index: number; consumerName: string } }
  | { type: "REMOVE_CONSUMER"; payload: { itemIndex: number; consumerName: string } }
  | { type: "SAVE_BILL"; payload: { bill: Bill } }
  | { type: "UPLOAD_START" }
  | { type: "UPLOAD_SUCCESS"; payload: OCRResponse }
  | { type: "UPLOAD_FINISH" }
  | { type: "CALCULATE_SUCCESS"; payload: { paymentPlans: PaymentPlan[] } }
  | { type: "HIDE_RESULTS" };

const createEmptyItem = (): BillItem => ({
  name: "",
  price: 0,
  quantity: 1,
  consumed_by: [],
});

const createEmptyDraft = (): BillDraft => ({
  editingBillId: null,
  paidBy: "",
  taxRate: "5",
  serviceCharge: "0",
  amountPaid: "",
  items: [createEmptyItem()],
});

const initialState: BillSplitterState = {
  bills: [],
  draft: createEmptyDraft(),
  paymentPlans: [],
  showModal: false,
  showResults: false,
  isUploading: false,
};

const updateDraftItem = (
  items: BillItem[],
  index: number,
  field: BillItemField,
  value: BillItemFieldValue,
): BillItem[] =>
  items.map((item, itemIndex) => {
    if (itemIndex !== index) {
      return item;
    }

    switch (field) {
      case "name":
        return typeof value === "string" ? { ...item, name: value } : item;
      case "price":
        return typeof value === "number" ? { ...item, price: value } : item;
      case "quantity":
        return typeof value === "number" ? { ...item, quantity: value } : item;
      case "consumed_by":
        return Array.isArray(value) ? { ...item, consumed_by: value } : item;
      default:
        return item;
    }
  });

const billSplitterReducer = (state: BillSplitterState, action: BillSplitterAction): BillSplitterState => {
  switch (action.type) {
    case "OPEN_NEW_BILL":
      return {
        ...state,
        draft: createEmptyDraft(),
        paymentPlans: [],
        showModal: true,
        showResults: false,
      };
    case "OPEN_EDIT_BILL":
      return {
        ...state,
        draft: {
          editingBillId: action.payload.id,
          paidBy: action.payload.paid_by,
          taxRate: (action.payload.tax_rate * 100).toString(),
          serviceCharge: (action.payload.service_charge * 100).toString(),
          amountPaid: action.payload.amount_paid != null ? String(action.payload.amount_paid) : "",
          items: action.payload.items,
        },
        paymentPlans: [],
        showModal: true,
        showResults: false,
      };
    case "CLOSE_MODAL":
      return {
        ...state,
        draft: createEmptyDraft(),
        showModal: false,
      };
    case "DELETE_BILL":
      return {
        ...state,
        bills: state.bills.filter((bill) => bill.id !== action.payload.id),
      };
    case "SET_DRAFT_FIELD":
      return {
        ...state,
        draft: {
          ...state.draft,
          [action.payload.field]: action.payload.value,
        },
      };
    case "ADD_ITEM":
      return {
        ...state,
        draft: {
          ...state.draft,
          items: [...state.draft.items, createEmptyItem()],
        },
      };
    case "DELETE_ITEM":
      return {
        ...state,
        draft: {
          ...state.draft,
          items:
            state.draft.items.length > 1
              ? state.draft.items.filter((_, index) => index !== action.payload.index)
              : state.draft.items,
        },
      };
    case "UPDATE_ITEM":
      return {
        ...state,
        draft: {
          ...state.draft,
          items: updateDraftItem(
            state.draft.items,
            action.payload.index,
            action.payload.field,
            action.payload.value,
          ),
        },
      };
    case "ADD_CONSUMER":
      return {
        ...state,
        draft: {
          ...state.draft,
          items: state.draft.items.map((item, index) => {
            if (index !== action.payload.index || item.consumed_by.includes(action.payload.consumerName)) {
              return item;
            }

            return {
              ...item,
              consumed_by: [...item.consumed_by, action.payload.consumerName],
            };
          }),
        },
      };
    case "REMOVE_CONSUMER":
      return {
        ...state,
        draft: {
          ...state.draft,
          items: state.draft.items.map((item, index) => {
            if (index !== action.payload.itemIndex) {
              return item;
            }

            return {
              ...item,
              consumed_by: item.consumed_by.filter((consumer) => consumer !== action.payload.consumerName),
            };
          }),
        },
      };
    case "SAVE_BILL": {
      const nextBills = state.draft.editingBillId
        ? state.bills.map((currentBill) =>
            currentBill.id === state.draft.editingBillId ? action.payload.bill : currentBill,
          )
        : [...state.bills, action.payload.bill];

      return {
        ...state,
        bills: nextBills,
        draft: createEmptyDraft(),
        showModal: false,
      };
    }
    case "UPLOAD_START":
      return {
        ...state,
        isUploading: true,
      };
    case "UPLOAD_SUCCESS":
      return {
        ...state,
        draft: {
          ...state.draft,
          taxRate: (action.payload.tax_rate * 100).toString(),
          serviceCharge: (action.payload.service_charge * 100).toString(),
          amountPaid: action.payload.amount_paid.toString(),
          items: action.payload.items.map((item) => ({
            ...item,
            consumed_by: [],
          })),
        },
      };
    case "UPLOAD_FINISH":
      return {
        ...state,
        isUploading: false,
      };
    case "CALCULATE_SUCCESS":
      return {
        ...state,
        paymentPlans: action.payload.paymentPlans,
        showResults: true,
      };
    case "HIDE_RESULTS":
      return {
        ...state,
        showResults: false,
      };
    default:
      return state;
  }
};

export const useBillSplitter = () => {
  const [state, dispatch] = useReducer(billSplitterReducer, initialState);

  const handleAddBill = () => {
    dispatch({ type: "OPEN_NEW_BILL" });
  };

  const handleEditBill = (bill: Bill) => {
    dispatch({ type: "OPEN_EDIT_BILL", payload: bill });
  };

  const handleDeleteBill = (id: string) => {
    dispatch({ type: "DELETE_BILL", payload: { id } });
  };

  const handleSaveBill = () => {
    if (!state.draft.paidBy.trim()) {
      alert("Please enter who paid the bill");
      return;
    }

    const validItems = state.draft.items.filter(
      (item) => item.name.trim() && item.price > 0 && item.quantity > 0 && item.consumed_by.length > 0,
    );

    if (validItems.length === 0) {
      alert("Please add at least one valid item with consumers");
      return;
    }

    const bill: Bill = {
      id: state.draft.editingBillId || Date.now().toString(),
      paid_by: state.draft.paidBy.trim(),
      tax_rate: parseFloat(state.draft.taxRate) / 100,
      service_charge: parseFloat(state.draft.serviceCharge) / 100,
      items: validItems,
      amount_paid: state.draft.amountPaid ? parseFloat(state.draft.amountPaid) : 0,
    };

    dispatch({ type: "SAVE_BILL", payload: { bill } });
  };

  const handleAddItem = () => {
    dispatch({ type: "ADD_ITEM" });
  };

  const handleDeleteItem = (index: number) => {
    dispatch({ type: "DELETE_ITEM", payload: { index } });
  };

  const handleItemChange = (index: number, field: BillItemField, value: BillItemFieldValue) => {
    dispatch({ type: "UPDATE_ITEM", payload: { index, field, value } });
  };

  const handleConsumerKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const consumerName = input.value.trim();

    if (event.key !== "Enter" || !consumerName) {
      return;
    }

    event.preventDefault();
    dispatch({ type: "ADD_CONSUMER", payload: { index, consumerName } });
    input.value = "";
  };

  const removeConsumer = (itemIndex: number, consumerName: string) => {
    dispatch({ type: "REMOVE_CONSUMER", payload: { itemIndex, consumerName } });
  };

  const handleUploadReceipt = async (file: File) => {
    dispatch({ type: "UPLOAD_START" });

    try {
      const ocrData = await uploadReceipt(file);
      dispatch({ type: "UPLOAD_SUCCESS", payload: ocrData });
      alert("Receipt scanned! Please add who consumed each item.");
    } catch (error) {
      console.error("OCR error:", error);
      alert("Failed to scan receipt. Please try again.");
    } finally {
      dispatch({ type: "UPLOAD_FINISH" });
    }
  };

  const handleCalculateSplit = async () => {
    if (state.bills.length === 0) {
      alert("Please add at least one bill");
      return;
    }

    try {
      const result = await calculateSplit(state.bills);
      dispatch({ type: "CALCULATE_SUCCESS", payload: { paymentPlans: result.payment_plans } });
    } catch (error) {
      console.error("Split calculation error:", error);
      alert("Failed to calculate split. Please try again.");
    }
  };

  const handleCloseModal = () => {
    dispatch({ type: "CLOSE_MODAL" });
  };

  const handleBackToBills = () => {
    dispatch({ type: "HIDE_RESULTS" });
  };

  return {
    bills: state.bills,
    paymentPlans: state.paymentPlans,
    showModal: state.showModal,
    showResults: state.showResults,
    isUploading: state.isUploading,
    editingBillId: state.draft.editingBillId,
    paidBy: state.draft.paidBy,
    taxRate: state.draft.taxRate,
    serviceCharge: state.draft.serviceCharge,
    amountPaid: state.draft.amountPaid,
    items: state.draft.items,
    setPaidBy: (value: string) =>
      dispatch({ type: "SET_DRAFT_FIELD", payload: { field: "paidBy", value } }),
    setTaxRate: (value: string) =>
      dispatch({ type: "SET_DRAFT_FIELD", payload: { field: "taxRate", value } }),
    setServiceCharge: (value: string) =>
      dispatch({ type: "SET_DRAFT_FIELD", payload: { field: "serviceCharge", value } }),
    setAmountPaid: (value: string) =>
      dispatch({ type: "SET_DRAFT_FIELD", payload: { field: "amountPaid", value } }),
    handleAddBill,
    handleEditBill,
    handleDeleteBill,
    handleSaveBill,
    handleAddItem,
    handleDeleteItem,
    handleItemChange,
    handleConsumerKeyDown,
    removeConsumer,
    handleUploadReceipt,
    handleCalculateSplit,
    handleCloseModal,
    handleBackToBills,
  };
};
