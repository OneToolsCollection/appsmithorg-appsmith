import { ReduxAction, ReduxActionTypes } from "constants/ReduxActionConstants";
import { IndicatorLocation } from "pages/Editor/GuidedTour/Indicator";
import { createReducer } from "utils/AppsmithUtils";

const initialState: OnboardingState = {
  // Signposting
  inOnboardingWidgetSelection: false,
  enableFirstTimeUserOnboarding: false,
  forceOpenWidgetPanel: false,
  firstTimeUserOnboardingApplicationId: "",
  firstTimeUserOnboardingComplete: false,
  showFirstTimeUserOnboardingModal: false,
  // Guided tour
  guidedTour: false,
  loading: false,
  exploring: false,
  tableWidgetId: "",
  queryId: "",
  datasourceId: "",
  currentStep: 1,
  showSuccessMessage: false,
  tableWidgetWasSelected: false,
  hadReachedStep: 1,
  showEndTourDialog: false,
  showDeviatingDialog: false,
};

export interface OnboardingState {
  inOnboardingWidgetSelection: boolean;
  enableFirstTimeUserOnboarding: boolean;
  forceOpenWidgetPanel: boolean;
  firstTimeUserOnboardingApplicationId: string;
  firstTimeUserOnboardingComplete: boolean;
  showFirstTimeUserOnboardingModal: boolean;
  guidedTour: boolean;
  loading: boolean;
  exploring: boolean;
  tableWidgetId: string;
  queryId: string;
  datasourceId: string;
  currentStep: number;
  indicatorLocation?: IndicatorLocation;
  showSuccessMessage: boolean;
  tableWidgetWasSelected: boolean;
  hadReachedStep: number;
  showEndTourDialog: boolean;
  showDeviatingDialog: boolean;
}

const onboardingReducer = createReducer(initialState, {
  [ReduxActionTypes.CREATE_APPLICATION_SUCCESS]: (state: OnboardingState) => {
    return {
      ...state,
      ...initialState,
      enableFirstTimeUserOnboarding: state.enableFirstTimeUserOnboarding,
      firstTimeUserOnboardingApplicationId:
        state.firstTimeUserOnboardingApplicationId,
      showFirstTimeUserOnboardingModal: state.showFirstTimeUserOnboardingModal,
    };
  },
  [ReduxActionTypes.TOGGLE_ONBOARDING_WIDGET_SELECTION]: (
    state: OnboardingState,
    action: ReduxAction<boolean>,
  ) => {
    return {
      ...state,
      inOnboardingWidgetSelection: action.payload,
    };
  },
  [ReduxActionTypes.SET_ENABLE_FIRST_TIME_USER_ONBOARDING]: (
    state: OnboardingState,
    action: ReduxAction<boolean>,
  ) => {
    return {
      ...state,
      enableFirstTimeUserOnboarding: action.payload,
    };
  },
  [ReduxActionTypes.SET_FIRST_TIME_USER_ONBOARDING_APPLICATION_ID]: (
    state: OnboardingState,
    action: ReduxAction<string>,
  ) => {
    return {
      ...state,
      firstTimeUserOnboardingApplicationId: action.payload,
    };
  },
  [ReduxActionTypes.SET_FIRST_TIME_USER_ONBOARDING_COMPLETE]: (
    state: OnboardingState,
    action: ReduxAction<boolean>,
  ) => {
    return {
      ...state,
      firstTimeUserOnboardingComplete: action.payload,
    };
  },
  [ReduxActionTypes.SET_SHOW_FIRST_TIME_USER_ONBOARDING_MODAL]: (
    state: OnboardingState,
    action: ReduxAction<boolean>,
  ) => {
    return {
      ...state,
      showFirstTimeUserOnboardingModal: action.payload,
    };
  },
  [ReduxActionTypes.SET_FORCE_WIDGET_PANEL_OPEN]: (
    state: OnboardingState,
    action: ReduxAction<boolean>,
  ) => {
    return { ...state, forceOpenWidgetPanel: action.payload };
  },
  [ReduxActionTypes.ENABLE_GUIDED_TOUR]: (
    state: OnboardingState,
    action: ReduxAction<boolean>,
  ) => {
    return {
      ...state,
      guidedTour: action.payload,
      exploring: action.payload,
    };
  },
  [ReduxActionTypes.GUIDED_TOUR_TOGGLE_LOADER]: (
    state: OnboardingState,
    action: ReduxAction<boolean>,
  ) => {
    return {
      ...state,
      loading: action.payload,
      exploring: !action.payload ? false : state.exploring,
    };
  },
  SET_DATASOURCE_ID: (state: OnboardingState, action: ReduxAction<string>) => {
    return {
      ...state,
      datasourceId: action.payload,
    };
  },
  SET_QUERY_ID: (state: OnboardingState, action: ReduxAction<string>) => {
    return {
      ...state,
      queryId: action.payload,
    };
  },
  SET_TABLE_WIDGET_ID: (
    state: OnboardingState,
    action: ReduxAction<string>,
  ) => {
    return {
      ...state,
      tableWidgetId: action.payload,
    };
  },
  [ReduxActionTypes.SET_CURRENT_STEP]: (
    state: OnboardingState,
    action: ReduxAction<number>,
  ) => {
    return {
      ...state,
      currentStep: action.payload,
      showSuccessMessage: false,
      hadReachedStep:
        action.payload > state.hadReachedStep
          ? action.payload
          : state.hadReachedStep,
    };
  },
  [ReduxActionTypes.SET_INDICATOR_LOCATION]: (
    state: OnboardingState,
    action: ReduxAction<IndicatorLocation>,
  ) => {
    return {
      ...state,
      indicatorLocation: action.payload,
    };
  },
  [ReduxActionTypes.GUIDED_TOUR_MARK_STEP_COMPLETED]: (
    state: OnboardingState,
  ) => {
    return {
      ...state,
      showSuccessMessage: true,
    };
  },
  [ReduxActionTypes.TABLE_WIDGET_WAS_SELECTED]: (
    state: OnboardingState,
    action: ReduxAction<boolean>,
  ) => {
    return {
      ...state,
      tableWidgetWasSelected: action.payload,
    };
  },
  [ReduxActionTypes.TOGGLE_DEVIATION_DIALOG]: (
    state: OnboardingState,
    action: ReduxAction<boolean>,
  ) => {
    return {
      ...state,
      showDeviatingDialog: action.payload,
    };
  },
  [ReduxActionTypes.TOGGLE_END_GUIDED_TOUR_DIALOG]: (
    state: OnboardingState,
    action: ReduxAction<boolean>,
  ) => {
    return {
      ...state,
      showEndTourDialog: action.payload,
    };
  },
});

export default onboardingReducer;
