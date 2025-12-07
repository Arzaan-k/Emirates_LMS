type onBoardingSlidesType = {
    color: String,
    image: any,
    title: String,
    secondTitle: String,
    subTitle: String
}
interface SliderProps {
    index: number;
    setIndex: (value: number) => void;
    children: React.ReactNode;
    prev?: React.ReactNode;
    next?: React.ReactNode;
}

declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.gif';
