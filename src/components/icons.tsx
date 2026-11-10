// Pudding icons, taken from the Figma icon set (24 x 24, Hollow).
type IconProps = { className?: string };

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9.41424 11.9999L16.4142 4.99991L15 3.58569L6.58582 11.9999L15 20.4141L16.4142 18.9999L9.41424 11.9999Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.6"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9.00003 3.58569L7.58582 4.99991L14.5858 11.9999L7.58582 18.9999L9.00003 20.4141L17.4142 11.9999L9.00003 3.58569Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.6"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export function QuestionCircleIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 10C8 7.79086 9.79086 6 12 6C14.2091 6 16 7.79086 16 10C16 11.8638 14.7252 13.4299 13 13.874V14.5125H11V12H12C13.1046 12 14 11.1046 14 10C14 8.89543 13.1046 8 12 8C10.8954 8 10 8.89543 10 10H8Z"
        fill="currentColor"
      />
      <path d="M13 18V16H11V18H13Z" fill="currentColor" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Filled black circle with a cross, used to clear a text field.
export function CloseCircleFilledIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM12 10.5859L9.17188 7.75781L7.75781 9.17188L10.5859 12L7.75781 14.8281L9.17188 16.2422L12 13.4141L14.8281 16.2422L16.2422 14.8281L13.4141 12L16.2422 9.17188L14.8281 7.75781L12 10.5859Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Loading spinner: an open ring that turns.
export function SpinnerIcon({ className }: IconProps) {
  return (
    <svg className={`animate-spin ${className ?? ""}`} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3a9 9 0 1 0 9 9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Alert-circle (Filled) from the Pudding icon set, in the negative red.
// The mark is cut out, so the snackbar's black shows through.
export function AlertCircleIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM11 16V18H13V16H11ZM11 6V14.5H13V6H11Z"
        fill="#de1135"
      />
    </svg>
  );
}

// Tick-circle (Filled) from the Pudding icon set, in the positive green.
export function TickCircleIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM15.9473 7.8584L9.94043 13.8877L7.05273 10.9883L6.91113 10.8457L6.76953 10.9883L5.8584 11.9023L5.71777 12.0439L5.8584 12.1846L9.7998 16.1416L9.94141 16.2832L10.083 16.1416L17.1416 9.05566L17.2822 8.91406L17.1416 8.77344L16.2305 7.8584L16.0889 7.7168L15.9473 7.8584Z"
        fill="#0e8345"
      />
    </svg>
  );
}

// Eye (Hollow) from the Pudding icon set.
export function EyeIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 8.5C10.067 8.5 8.49998 10.067 8.49998 12C8.49998 13.933 10.067 15.5 12 15.5C13.933 15.5 15.5 13.933 15.5 12C15.5 10.067 13.933 8.5 12 8.5ZM10.5 12C10.5 11.1716 11.1715 10.5 12 10.5C12.8284 10.5 13.5 11.1716 13.5 12C13.5 12.8284 12.8284 13.5 12 13.5C11.1715 13.5 10.5 12.8284 10.5 12Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M12 4C8.11221 4 5.59691 5.96259 4.08866 7.88218C3.33936 8.83583 2.83163 9.78476 2.51074 10.4941C2.34975 10.85 2.23423 11.149 2.15784 11.3629C2.11961 11.4699 2.09108 11.5559 2.07146 11.6174C2.06165 11.6482 2.05406 11.6728 2.04859 11.691C2.04585 11.7 2.04365 11.7074 2.04197 11.7132C2.04112 11.716 2.04041 11.7185 2.03983 11.7205L2.03904 11.7232L2.03872 11.7243C2.03858 11.7248 2.03845 11.7253 2.99998 12L2.03845 11.7253L1.95996 12L2.03845 12.2747L2.99998 12C2.03845 12.2747 2.03858 12.2752 2.03872 12.2757L2.03904 12.2768L2.03983 12.2795L2.04059 12.2821L2.04197 12.2868C2.04365 12.2926 2.04585 12.3 2.04859 12.309C2.05406 12.3272 2.06165 12.3518 2.07146 12.3826C2.09108 12.4441 2.11961 12.5301 2.15784 12.6371C2.23423 12.851 2.34975 13.15 2.51074 13.5059C2.83163 14.2152 3.33936 15.1642 4.08866 16.1178C5.59691 18.0374 8.11221 20 12 20C15.8877 20 18.403 18.0374 19.9113 16.1178C20.6606 15.1642 21.1683 14.2152 21.4892 13.5059C21.6502 13.15 21.7657 12.851 21.8421 12.6371C21.8803 12.5301 21.9089 12.4441 21.9285 12.3826C21.9383 12.3518 21.9459 12.3272 21.9514 12.309C21.9526 12.3049 21.9538 12.3011 21.9548 12.2976C21.956 12.2935 21.9571 12.2899 21.958 12.2868L21.959 12.2833L21.9601 12.2795L21.9609 12.2768L21.9612 12.2757C21.9614 12.2752 21.9615 12.2747 21 12L21.9615 12.2747L22.04 12L21.9615 11.7253L21 12C21.9615 11.7253 21.9614 11.7248 21.9612 11.7243L21.9609 11.7232L21.9601 11.7205C21.9595 11.7185 21.9588 11.716 21.958 11.7132C21.9563 11.7074 21.9541 11.7 21.9514 11.691C21.9459 11.6728 21.9383 11.6482 21.9285 11.6174C21.9089 11.5559 21.8803 11.4699 21.8421 11.3629C21.7657 11.149 21.6502 10.85 21.4892 10.4941C21.1683 9.78476 20.6606 8.83583 19.9113 7.88218C18.403 5.96259 15.8877 4 12 4ZM4.33296 12.6816C4.20632 12.4017 4.11483 12.1673 4.05413 12C4.11483 11.8327 4.20632 11.5983 4.33296 11.3184C4.60583 10.7152 5.03559 9.91417 5.66129 9.11782C6.90305 7.53741 8.88774 6 12 6C15.1122 6 17.0969 7.53741 18.3387 9.11782C18.9644 9.91417 19.3941 10.7152 19.667 11.3184C19.7936 11.5983 19.8851 11.8327 19.9458 12C19.8851 12.1673 19.7936 12.4017 19.667 12.6816C19.3941 13.2848 18.9644 14.0858 18.3387 14.8822C17.0969 16.4626 15.1122 18 12 18C8.88774 18 6.90305 16.4626 5.66129 14.8822C5.03559 14.0858 4.60583 13.2848 4.33296 12.6816Z" fill="currentColor" />
    </svg>
  );
}

// Eye closed (Hollow) from the Pudding icon set.
export function EyeClosedIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M3.24998 3.33569L5.94084 6.02655C7.42155 4.87424 9.40505 3.9999 12 3.9999C15.8877 3.9999 18.403 5.96249 19.9113 7.88208C20.6606 8.83573 21.1683 9.78466 21.4892 10.494C21.6502 10.8499 21.7657 11.1489 21.8421 11.3628C21.8803 11.4698 21.9089 11.5558 21.9285 11.6173C21.9383 11.6481 21.9459 11.6727 21.9514 11.6909C21.9526 11.6948 21.9537 11.6985 21.9547 11.7019C21.9559 11.7061 21.957 11.7099 21.958 11.7131C21.9588 11.7159 21.9595 11.7184 21.9601 11.7204L21.9609 11.7231L21.9612 11.7242C21.9614 11.7247 21.9615 11.7252 21 11.9999C21.9615 12.2746 21.9614 12.2751 21.9612 12.2756L21.9609 12.2767L21.9601 12.2794C21.9595 12.2814 21.9588 12.2839 21.958 12.2867L21.9566 12.2915C21.956 12.2934 21.9554 12.2954 21.9548 12.2975C21.9538 12.301 21.9526 12.3048 21.9514 12.3089C21.9459 12.3271 21.9383 12.3517 21.9285 12.3825C21.9089 12.444 21.8803 12.53 21.8421 12.637C21.7657 12.8509 21.6502 13.1499 21.4892 13.5058C21.1683 14.2151 20.6606 15.1641 19.9113 16.1177C19.3879 16.7838 18.7433 17.4551 17.9621 18.0478L20.6642 20.7499L19.4142 21.9999L1.99998 4.58569L3.24998 3.33569ZM18.3387 14.8821C17.8561 15.4963 17.2613 16.104 16.5317 16.6174L14.433 14.5187L14.5164 14.4325C15.1243 13.8037 15.5 12.9446 15.5 11.9999C15.5 10.0669 13.933 8.4999 12 8.4999C11.0552 8.4999 10.1962 8.87553 9.5674 9.48344L9.48113 9.56684L7.36822 7.45393C8.52953 6.60871 10.0415 5.9999 12 5.9999C15.1122 5.9999 17.0969 7.53731 18.3387 9.11772C18.9644 9.91407 19.3941 10.7151 19.667 11.3183C19.7936 11.5982 19.8851 11.8326 19.9458 11.9999C19.8851 12.1672 19.7936 12.4016 19.667 12.6815C19.3941 13.2847 18.9644 14.0857 18.3387 14.8821ZM13.0786 13.0423L13.0186 13.1043L10.8955 10.9813L10.9576 10.9213C11.2284 10.6594 11.5945 10.4999 12 10.4999C12.8284 10.4999 13.5 11.1715 13.5 11.9999C13.5 12.4053 13.3404 12.7715 13.0786 13.0423ZM20.039 12.2766C20.0392 12.2771 20.0392 12.2772 20.0391 12.2768L20.039 12.2766Z" fill="currentColor" />
      <path d="M3.4153 8.82944C3.02036 9.44422 2.72421 10.0221 2.51074 10.494C2.34975 10.8499 2.23423 11.1489 2.15784 11.3628C2.11961 11.4698 2.09108 11.5558 2.07146 11.6173C2.06165 11.6481 2.05406 11.6727 2.04859 11.6909C2.04585 11.6999 2.04365 11.7073 2.04197 11.7131C2.04112 11.7159 2.04041 11.7184 2.03983 11.7204L2.03904 11.7231L2.03872 11.7242C2.03858 11.7247 2.03845 11.7252 2.99998 11.9999L2.03845 11.7252L1.95996 11.9999L2.03845 12.2746L2.99998 11.9999C2.03845 12.2746 2.03858 12.2751 2.03872 12.2756L2.03904 12.2767L2.03983 12.2794L2.04059 12.282L2.04197 12.2867C2.04365 12.2925 2.04585 12.2999 2.04859 12.3089C2.05406 12.3271 2.06165 12.3517 2.07146 12.3825C2.09108 12.444 2.11961 12.53 2.15784 12.637C2.23423 12.8509 2.34975 13.1499 2.51074 13.5058C2.83163 14.2151 3.33936 15.1641 4.08866 16.1177C5.59691 18.0373 8.11221 19.9999 12 19.9999C12.8399 19.9999 13.6157 19.9083 14.3312 19.7453L12.5682 17.9824C12.3831 17.9939 12.1937 17.9999 12 17.9999C8.88774 17.9999 6.90305 16.4625 5.66129 14.8821C5.03559 14.0857 4.60583 13.2847 4.33296 12.6815C4.20632 12.4016 4.11483 12.1672 4.05413 11.9999C4.11483 11.8326 4.20632 11.5982 4.33296 11.3183C4.47027 11.0148 4.64732 10.6611 4.86907 10.2832L3.4153 8.82944Z" fill="currentColor" />
      <path d="M21 11.9999L21.9615 11.7252L22.04 11.9999L21.9615 12.2746L21 11.9999Z" fill="currentColor" />
    </svg>
  );
}

// Chevron down (Hollow) from the Pudding icon set.
export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 14.5857L5.00003 7.58569L3.58582 8.99991L12 17.4141L20.4142 8.99991L19 7.58569L12 14.5857Z" fill="currentColor" />
      <path d="M12 14.5857L5.00003 7.58569L3.58582 8.99991L12 17.4141L20.4142 8.99991L19 7.58569L12 14.5857Z" fill="currentColor" />
      <path d="M5.00003 7.58569L12 14.5857L19 7.58569L20.4142 8.99991L12 17.4141L3.58582 8.99991L5.00003 7.58569Z" fill="currentColor" />
    </svg>
  );
}

// Pencil (Hollow) from the Pudding icon set.
export function PencilIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M16.4492 1.89355L22.1061 7.55041L9.08526 20.5712L3.42841 20.5712L3.42841 14.9144L16.4492 1.89355ZM16.4492 4.72198L15.0262 6.14504L17.8546 8.97347L19.2776 7.55041L16.4492 4.72198ZM16.4404 10.3877L13.612 7.55925L5.42841 15.7428L5.42841 18.5712L8.25683 18.5712L16.4404 10.3877Z" fill="currentColor" />
    </svg>
  );
}

// Checkmark (Hollow) from the Pudding icon set.
export function CheckmarkIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M20.5405 7.22476L9.58031 18.1849L3.46057 12.0652L4.87478 10.651L9.58031 15.3565L19.1262 5.81055L20.5405 7.22476Z" fill="currentColor" />
    </svg>
  );
}

// Calendar (Hollow) from the Pudding icon set.
export function CalendarIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 5H17V2H19V5H22V21H2V5H5V2H7V5ZM6 14.125V16.625H8.5V14.125H6ZM10.75 14.125V16.625H13.25V14.125H10.75ZM15.5 14.125V16.625H18V14.125H15.5ZM6 9.375V11.875H8.5V9.375H6ZM10.75 9.375V11.875H13.25V9.375H10.75ZM15.5 9.375V11.875H18V9.375H15.5Z" fill="currentColor" />
    </svg>
  );
}

// Close (Hollow) from the Pudding icon set.
export function CloseIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 10.5859L5.63602 4.22192L4.2218 5.63614L10.5858 12.0001L4.2218 18.3641L5.63602 19.7783L12 13.4143L18.3639 19.7783L19.7781 18.3641L13.4142 12.0001L19.7781 5.63614L18.3639 4.22192L12 10.5859Z" fill="currentColor" />
    </svg>
  );
}

// Chevron up (Hollow) from the Pudding icon set.
export function ChevronUpIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 6.58569L3.58582 14.9999L5.00003 16.4141L12 9.41412L19 16.4141L20.4142 14.9999L12 6.58569Z" fill="currentColor" />
    </svg>
  );
}

export function GiftIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2.05051C12.6353 1.40223 13.5207 1 14.5 1C16.433 1 18 2.567 18 4.5C18 5.0368 17.8792 5.54537 17.6632 6H22V14H21V22H3V14H2V6H6.33682C6.12085 5.54537 6 5.0368 6 4.5C6 2.567 7.567 1 9.5 1C10.4793 1 11.3647 1.40223 12 2.05051ZM11 4.5C11 3.67157 10.3284 3 9.5 3C8.67157 3 8 3.67157 8 4.5C8 5.32843 8.67157 6 9.5 6C10.3284 6 11 5.32843 11 4.5ZM4 8V12H11V8H4ZM16 4.5C16 5.32843 15.3284 6 14.5 6C13.6716 6 13 5.32843 13 4.5C13 3.67157 13.6716 3 14.5 3C15.3284 3 16 3.67157 16 4.5ZM13 8H20V12H13V8ZM13 14V20H19V14H13ZM11 14H5V20H11V14Z" fill="currentColor" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M11 2C6.02944 2 2 6.02944 2 11C2 15.9706 6.02944 20 11 20C13.125 20 15.078 19.2635 16.6177 18.0319L21 22.4142L22.4142 21L18.0319 16.6177C19.2635 15.078 20 13.125 20 11C20 6.02944 15.9706 2 11 2ZM4 11C4 7.13401 7.13401 4 11 4C14.866 4 18 7.13401 18 11C18 14.866 14.866 18 11 18C7.13401 18 4 14.866 4 11Z" fill="currentColor" />
    </svg>
  );
}

export function UserIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C9.51472 2 7.5 4.01472 7.5 6.5C7.5 8.98528 9.51472 11 12 11C14.4853 11 16.5 8.98528 16.5 6.5C16.5 4.01472 14.4853 2 12 2ZM9.5 6.5C9.5 5.11929 10.6193 4 12 4C13.3807 4 14.5 5.11929 14.5 6.5C14.5 7.88071 13.3807 9 12 9C10.6193 9 9.5 7.88071 9.5 6.5Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M12 12.5C7.58172 12.5 4 16.0817 4 20.5V22H20V20.5C20 16.0817 16.4183 12.5 12 12.5ZM12 14.5C15.1453 14.5 17.7254 16.9202 17.9795 20H6.02054C6.27461 16.9202 8.85467 14.5 12 14.5Z" fill="currentColor" />
    </svg>
  );
}

export function SlidersIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M6 6.17071V3H4V6.17071C2.83481 6.58254 2 7.69378 2 9C2 10.3062 2.83481 11.4175 4 11.8293V21H6V11.8293C7.16519 11.4175 8 10.3062 8 9C8 7.69378 7.16519 6.58254 6 6.17071ZM4 9C4 8.44772 4.44772 8 5 8C5.55228 8 6 8.44772 6 9C6 9.55228 5.55228 10 5 10C4.44772 10 4 9.55228 4 9Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M11 13.1707C9.83481 13.5825 9 14.6938 9 16C9 17.3062 9.83481 18.4175 11 18.8293V21H13V18.8293C14.1652 18.4175 15 17.3062 15 16C15 14.6938 14.1652 13.5825 13 13.1707V3H11V13.1707ZM11 16C11 15.4477 11.4477 15 12 15C12.5523 15 13 15.4477 13 16C13 16.5523 12.5523 17 12 17C11.4477 17 11 16.5523 11 16Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M20 8.17071V3H18V8.17071C16.8348 8.58254 16 9.69378 16 11C16 12.3062 16.8348 13.4175 18 13.8293V21H20V13.8293C21.1652 13.4175 22 12.3062 22 11C22 9.69378 21.1652 8.17071 20 8.17071ZM18 11C18 10.4477 18.4477 10 19 10C19.5523 10 20 10.4477 20 11C20 11.5523 19.5523 12 19 12C18.4477 12 18 11.5523 18 11Z" fill="currentColor" />
    </svg>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 1.91211L15.6362 3.47047L20 2.84707V11.9449C20 15.4302 18.1395 18.6505 15.1201 20.3915L12.0669 22.1518L8.94502 20.3837C5.88897 18.6528 4 15.4121 4 11.8999V2.84707L8.36382 3.47047L12 1.91211ZM12 4.08804L8.63618 5.52968L6 5.15309V11.8999C6 14.6916 7.50149 17.2676 9.93066 18.6434L12.0581 19.8483L14.1211 18.6588C16.5212 17.275 18 14.7153 18 11.9449V5.15309L15.3638 5.52968L12 4.08804Z" fill="currentColor" />
    </svg>
  );
}

export function HeartIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M4.92358 6.73514C4.33138 7.50833 4 8.59846 4 9.76667C4 10.939 4.46115 12.1359 5.24024 13.3135C6.01747 14.4882 7.07215 15.584 8.15795 16.5327C9.23993 17.4781 10.3267 18.2547 11.1452 18.7959C11.4846 19.0202 11.7761 19.203 12 19.3394C12.2239 19.203 12.5154 19.0202 12.8548 18.7959C13.6733 18.2547 14.7601 17.4781 15.842 16.5327C16.9279 15.584 17.9825 14.4882 18.7598 13.3135C19.5388 12.1359 20 10.939 20 9.76667C20 8.59667 19.6708 7.5067 19.0805 6.73435C18.5118 5.99035 17.6757 5.5 16.5 5.5C15.2968 5.5 14.3905 5.99713 13.7652 6.51822C13.4519 6.77926 13.2168 7.04069 13.0621 7.23407C12.9852 7.33022 12.9294 7.40794 12.895 7.45811C12.8779 7.48314 12.8661 7.50115 12.8598 7.51098C12.8576 7.51449 12.8561 7.51695 12.8552 7.51829L12.0036 8.93773L11.1466 7.52134C11.1458 7.51998 11.1442 7.51747 11.1419 7.51386C11.1355 7.50394 11.1236 7.48583 11.1062 7.4607C11.0715 7.41034 11.0152 7.33241 10.9377 7.23605C10.7818 7.04223 10.5453 6.78033 10.2309 6.51888C9.6028 5.99653 8.69628 5.5 7.5 5.5C6.3315 5.5 5.49462 5.98958 4.92358 6.73514ZM12 20.5C11.5148 21.3744 11.5146 21.3743 11.5143 21.3741L11.5115 21.3726C11.5099 21.3717 11.5077 21.3704 11.5049 21.3689C11.4995 21.3658 11.4919 21.3616 11.4822 21.3561C11.4628 21.3452 11.4352 21.3294 11.3997 21.309C11.3289 21.2682 11.227 21.2087 11.0985 21.1316C10.8417 20.9773 10.4777 20.7521 10.0423 20.4643C9.17334 19.8898 8.01007 19.0594 6.84205 18.0388C5.67785 17.0217 4.48253 15.7929 3.57226 14.417C2.66385 13.044 2 11.4643 2 9.76667C2 8.25154 2.42487 6.70834 3.3358 5.51902C4.26788 4.30209 5.681 3.5 7.5 3.5C9.29122 3.5 10.6347 4.25347 11.5097 4.98112C11.6913 5.13212 11.8541 5.28305 11.9982 5.42761C12.1418 5.28323 12.3039 5.13254 12.4848 4.98178C13.3595 4.25287 14.7032 3.5 16.5 3.5C18.3243 3.5 19.7382 4.30132 20.6695 5.51982C21.5792 6.70997 22 8.25333 22 9.76667C22 11.4643 21.3362 13.044 20.4277 14.417C19.5175 15.7929 18.3221 17.0217 17.158 18.0388C15.9899 19.0594 14.8267 19.8898 13.9577 20.4643C13.5223 20.7521 13.1583 20.9773 12.9015 21.1316C12.773 21.2087 12.6711 21.2682 12.6003 21.309C12.5648 21.3294 12.5372 21.3452 12.5178 21.3561C12.5132 21.3587 12.5091 21.361 12.5055 21.363C12.5014 21.3653 12.4979 21.3673 12.4951 21.3689C12.4923 21.3704 12.4901 21.3717 12.4885 21.3726L12.4857 21.3741C12.4854 21.3743 12.4852 21.3744 12 20.5ZM12 20.5L12.4852 21.3744L12 21.6436L11.5148 21.3744L12 20.5Z" fill="currentColor" />
    </svg>
  );
}

export function UploadIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M17.3517 7.36245L13 3.01074V2.99995H12.9892L12 2.01074L11.0108 2.99995H11V3.01075L6.64829 7.36245L8.0625 8.77667L11 5.83917L11 17H13L13 5.83916L15.9375 8.77667L17.3517 7.36245Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M5 20V15H3V22H21V15H19V20H5Z" fill="currentColor" />
    </svg>
  );
}

export function CardIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M11 13.5L6 13.5V15.5L11 15.5V13.5Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M2 4.5H22V19.5H2V4.5ZM4 6.5V9.5H20V6.5H4ZM4 17.5V11.5H20V17.5H4Z" fill="currentColor" />
    </svg>
  );
}

export function PowerIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M13 2L11 2V14.5H13V2Z" fill="currentColor" />
      <path d="M9 5.62407V3.48341C5.22342 4.73933 2.5 8.30162 2.5 12.5C2.5 17.7467 6.75329 22 12 22C17.2467 22 21.5 17.7467 21.5 12.5C21.5 8.30162 18.7766 4.73934 15 3.48341V5.62407C17.6489 6.7814 19.5 9.42452 19.5 12.5C19.5 16.6421 16.1421 20 12 20C7.85786 20 4.5 16.6421 4.5 12.5C4.5 9.42452 6.35114 6.7814 9 5.62407Z" fill="currentColor" />
    </svg>
  );
}

export function FileIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M16 11H8V13H16V11Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M8 7H14V9H8V7Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M16 15H8V17H16V15Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M15.4142 2H4V22H20V6.58579L15.4142 2ZM6 20V4H14.5858L18 7.41421V20H6Z" fill="currentColor" />
    </svg>
  );
}

export function RefreshIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M20 12C20 7.58172 16.4183 4 12 4V2C17.5229 2 22 6.47715 22 12C22 17.5228 17.5229 22 12 22C6.47718 22 2.00002 17.5228 2.00002 12C2.00002 9.35486 3.02741 6.9501 4.70299 5.1625L1.52502 5.1625L1.52502 3.1625L8.52502 3.1625V10.1625H6.52502L6.52502 6.16678C4.96974 7.62702 4.00002 9.70051 4.00002 12C4.00002 16.4183 7.58175 20 12 20C16.4183 20 20 16.4183 20 12Z" fill="currentColor" />
    </svg>
  );
}

export function GearIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 8.4999C10.067 8.4999 8.50002 10.0669 8.50002 11.9999C8.50002 13.9329 10.067 15.4999 12 15.4999C13.933 15.4999 15.5 13.9329 15.5 11.9999C15.5 10.0669 13.933 8.4999 12 8.4999ZM10.5 11.9999C10.5 11.1715 11.1716 10.4999 12 10.4999C12.8285 10.4999 13.5 11.1715 13.5 11.9999C13.5 12.8283 12.8285 13.4999 12 13.4999C11.1716 13.4999 10.5 12.8283 10.5 11.9999Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M15.0503 4.63594L12 1.58569L8.94978 4.63594H4.63606V8.94966L1.58582 11.9999L4.63606 15.0502V19.3639H8.94978L12 22.4141L15.0503 19.3639H19.364V15.0502L22.4142 11.9999L19.364 8.94965V4.63594H15.0503ZM9.77821 6.63594L12 4.41412L14.2219 6.63594H17.364V9.77808L19.5858 11.9999L17.364 14.2217V17.3639H14.2219L12 19.5857L9.7782 17.3639H6.63606V14.2217L4.41424 11.9999L6.63606 9.77809V6.63594H9.77821Z" fill="currentColor" />
    </svg>
  );
}

// Filled question circle used for hints and notes. `dot` is the circle, `mark` the question mark.
export function QuestionCircleFilledIcon({
  className,
  mark = "#fff",
  dot = "#000",
}: IconProps & { mark?: string; dot?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill={dot} />
      <path
        d="M8 10C8 7.79086 9.79086 6 12 6C14.2091 6 16 7.79086 16 10C16 11.8638 14.7252 13.4299 13 13.874V14.5125H11V12H12C13.1046 12 14 11.1046 14 10C14 8.89543 13.1046 8 12 8C10.8954 8 10 8.89543 10 10H8Z"
        fill={mark}
      />
      <path d="M13 18V16H11V18H13Z" fill={mark} />
    </svg>
  );
}
